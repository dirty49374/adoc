//! The browser side of the _Hub_Server_ on the exposed port `web`: _Browser_Approval_ (fail
//! closed), _Hub_Discovery_ and the _Hub_Remap_ of `/<host>/…` through the host's tunnel. Every
//! URL handed to a browser is a path: the browser reaches the hub under another name and port.
use super::Shared;
use super::tunnel::{Incoming, Tunnel};
use crate::auth::{self, Outcome};
use crate::proto::{self, Kind, Open};
use axum::body::Body;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::{ConnectInfo, FromRequestParts, Request, State};
use axum::http::{HeaderMap, HeaderValue, Method, StatusCode, header};
use axum::response::sse::{Event, KeepAlive, Sse};
use axum::response::{IntoResponse, Response};
use bytes::Bytes;
use chrono::Utc;
use futures_util::{SinkExt, Stream, StreamExt};
use serde_json::json;
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::Arc;
use std::task::{Context, Poll};
use tokio::sync::mpsc;

const APPROVE_PAGE: &str = include_str!("../../web/approve.html");
const LIST_PAGE: &str = include_str!("../../web/index.html");
const UNAVAILABLE_PAGE: &str = include_str!("../../web/unavailable.html");
const DISCOVERY: &str = "/adoc-discovery";

pub async fn serve(listener: tokio::net::TcpListener, shared: Shared) {
    let app = axum::Router::new().fallback(handle).with_state(shared);
    if let Err(e) = axum::serve(listener, app.into_make_service_with_connect_info::<SocketAddr>()).await {
        tracing::error!("web listener: {e}");
    }
}

/// The browser's address: the first `X-Forwarded-For` entry (the ingress), else the peer.
fn client_address(headers: &HeaderMap, peer: SocketAddr) -> String {
    headers.get("x-forwarded-for").and_then(|v| v.to_str().ok()).and_then(|v| v.split(',').next()).map(|v| v.trim().to_string()).filter(|v| !v.is_empty()).unwrap_or_else(|| peer.ip().to_string())
}

fn is_upgrade(headers: &HeaderMap) -> bool { headers.get(header::UPGRADE).and_then(|v| v.to_str().ok()).is_some_and(|v| v.eq_ignore_ascii_case("websocket")) }

fn page(status: StatusCode, html: String) -> Response {
    (status, [(header::CONTENT_TYPE, "text/html; charset=utf-8"), (header::CACHE_CONTROL, "no-store")], html).into_response()
}

fn json_response(status: StatusCode, value: serde_json::Value) -> Response {
    (status, [(header::CONTENT_TYPE, "application/json"), (header::CACHE_CONTROL, "no-store")], value.to_string()).into_response()
}

fn escape(s: &str) -> String { s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;") }

fn unavailable(status: StatusCode, message: &str) -> Response { page(status, UNAVAILABLE_PAGE.replace("{{message}}", &escape(message))) }

async fn handle(State(shared): State<Shared>, ConnectInfo(peer): ConnectInfo<SocketAddr>, req: Request) -> Response {
    let path = req.uri().path().to_string();
    let method = req.method().clone();
    let address = client_address(req.headers(), peer);

    // the code request and its page are the only answers without a cookie
    if path == "/adoc-hub/pair" && method == Method::POST {
        let user_agent = req.headers().get(header::USER_AGENT).and_then(|v| v.to_str().ok()).unwrap_or("").to_string();
        let asked = shared.hub.lock().await.approvals.ask(&address, &user_agent, Utc::now());
        return match asked {
            Ok(p) => {
                tracing::info!("browser {address} asks for approval: code {}", p.code);
                shared.changed();
                json_response(StatusCode::OK, json!({"code": p.code, "secret": p.secret, "expires_in": auth::CODE_TTL_SECS}))
            }
            Err(e) => json_response(StatusCode::TOO_MANY_REQUESTS, json!({"error": e})),
        };
    }
    if let (Some(secret), &Method::GET) = (path.strip_prefix("/adoc-hub/pair/"), &method) {
        let outcome = shared.hub.lock().await.approvals.poll(secret, Utc::now());
        return match outcome {
            Outcome::Waiting => json_response(StatusCode::OK, json!({"state": "waiting"})),
            Outcome::Approved(cookie) => {
                let mut r = json_response(StatusCode::OK, json!({"state": "approved"}));
                r.headers_mut().insert(header::SET_COOKIE, HeaderValue::from_str(&auth::set_cookie(&cookie)).expect("cookie is ascii"));
                r
            }
            Outcome::Rejected => json_response(StatusCode::OK, json!({"state": "rejected"})),
            Outcome::Gone => json_response(StatusCode::OK, json!({"state": "expired"})),
        };
    }

    let cookie = auth::cookie_of(req.headers().get_all(header::COOKIE).iter().filter_map(|v| v.to_str().ok()));
    let browser = match cookie {
        Some(c) => {
            let mut hub = shared.hub.lock().await;
            let id = hub.approvals.check(&c, Utc::now());
            if id.is_some() {
                hub.seen_dirty = true;
            }
            id
        }
        None => None,
    };
    // spec _Browser_Approval_: fail closed, WebSocket upgrades and the discovery list included
    let Some(browser) = browser else {
        if is_upgrade(req.headers()) || path.starts_with(DISCOVERY) || !(method == Method::GET || method == Method::HEAD) {
            return (StatusCode::UNAUTHORIZED, [(header::CACHE_CONTROL, "no-store")], "this browser is not approved for the adoc hub").into_response();
        }
        return page(StatusCode::UNAUTHORIZED, APPROVE_PAGE.to_string());
    };

    match path.as_str() {
        "/" => page(StatusCode::OK, LIST_PAGE.to_string()),
        DISCOVERY => {
            let hosts = shared.hub.lock().await.hosts();
            json_response(StatusCode::OK, json!({"hosts": hosts}))
        }
        "/adoc-discovery/events" => discovery_events(shared, browser).await,
        _ => remap(shared, browser, address, req).await,
    }
}

/// `/adoc-discovery/events`: the host list as server-sent events, again on every change; it ends
/// when the browser is revoked.
async fn discovery_events(shared: Shared, browser: String) -> Response {
    struct S {
        shared: Shared,
        changes: tokio::sync::watch::Receiver<u64>,
        revoked: tokio::sync::broadcast::Receiver<String>,
        browser: String,
        last: Option<String>,
    }
    let state = S { changes: shared.changes.subscribe(), revoked: shared.revoked.subscribe(), shared, browser, last: None };
    let stream = futures_util::stream::unfold(state, |mut s| async move {
        loop {
            if s.last.is_some() {
                tokio::select! {
                    r = s.changes.changed() => if r.is_err() { return None },
                    r = s.revoked.recv() => match r {
                        Ok(id) if id == s.browser => return None,
                        Err(tokio::sync::broadcast::error::RecvError::Closed) => return None,
                        _ => continue,
                    },
                }
            }
            let data = json!({"hosts": s.shared.hub.lock().await.hosts()}).to_string();
            if s.last.as_ref() == Some(&data) {
                continue;
            }
            s.last = Some(data.clone());
            return Some((Ok::<_, std::convert::Infallible>(Event::default().data(data)), s));
        }
    });
    Sse::new(stream).keep_alive(KeepAlive::default()).into_response()
}

/// _Hub_Remap_: `/<host>/<path>` goes to that host's server as `/<path>`.
async fn remap(shared: Shared, browser: String, address: String, req: Request) -> Response {
    let path = req.uri().path().to_string();
    let query = req.uri().query().map(|q| format!("?{q}")).unwrap_or_default();
    let rest = &path[1..];
    let Some((segment, tail)) = rest.split_once('/') else {
        return (StatusCode::FOUND, [(header::LOCATION, format!("/{rest}/{query}"))]).into_response();
    };
    let (host, tunnel) = {
        let hub = shared.hub.lock().await;
        let Some((machine, host)) = hub.resolve(segment) else {
            return unavailable(StatusCode::NOT_FOUND, &format!("The hub knows no adoc host named {segment}."));
        };
        let tunnel = hub.machines.get(&machine).and_then(|m| m.tunnel.clone());
        (host, tunnel)
    };
    let Some(tunnel) = tunnel.filter(|_| host.status == "online") else {
        return unavailable(StatusCode::SERVICE_UNAVAILABLE, &format!("The adoc host {segment} ({}) is {} now.", host.workspace, if host.status == "online" { "unreachable" } else { "offline" }));
    };
    let mut headers: Vec<(String, String)> = Vec::new();
    for (name, value) in req.headers() {
        let Ok(value) = value.to_str() else { continue };
        if proto::hop_by_hop(name.as_str()) || name.as_str().starts_with("x-forwarded-") || name == "x-adoc-hub" {
            continue;
        }
        if name == header::COOKIE {
            if let Some(rest) = auth::without_hub_cookie(value) {
                headers.push(("cookie".into(), rest));
            }
            continue;
        }
        headers.push((name.as_str().to_string(), value.to_string()));
    }
    headers.push(("x-forwarded-prefix".into(), format!("/{segment}")));
    headers.push(("x-adoc-hub".into(), DISCOVERY.into()));
    headers.push(("x-forwarded-for".into(), address));
    let has_body = req.headers().get(header::CONTENT_LENGTH).and_then(|v| v.to_str().ok()).is_some_and(|v| v != "0") || req.headers().contains_key(header::TRANSFER_ENCODING);
    let upgrade = is_upgrade(req.headers());
    let open = Open { port: host.port, method: req.method().as_str().to_string(), path: format!("/{tail}{query}"), headers, body: has_body && !upgrade };

    if upgrade {
        let (mut parts, _) = req.into_parts();
        let ws = match WebSocketUpgrade::from_request_parts(&mut parts, &shared).await {
            Ok(ws) => ws,
            Err(e) => return e.into_response(),
        };
        return match tunnel.ws(&open).await {
            Ok((id, rx)) => {
                let revoked = shared.revoked.subscribe();
                ws.max_message_size(proto::CHUNK * 64).on_upgrade(move |socket| pump(socket, tunnel, id, rx, browser, revoked))
            }
            Err(head) => StatusCode::from_u16(head.status).unwrap_or(StatusCode::BAD_GATEWAY).into_response(),
        };
    }

    let (id, mut rx) = tunnel.http(&open).await;
    if open.body {
        let t = tunnel.clone();
        let mut body = req.into_body().into_data_stream();
        tokio::spawn(async move {
            while let Some(chunk) = body.next().await {
                let Ok(chunk) = chunk else {
                    t.send(Kind::Close, id, b"");
                    return;
                };
                for part in chunk.chunks(proto::CHUNK) {
                    t.send(Kind::Data, id, part);
                }
            }
            t.send(Kind::End, id, b"");
        });
    }
    let head = match tunnel.head(id, &mut rx).await {
        Ok(h) => h,
        Err(e) => return unavailable(StatusCode::BAD_GATEWAY, &format!("The adoc host {segment} did not answer: {e}.")),
    };
    let mut response = Response::builder().status(StatusCode::from_u16(head.status).unwrap_or(StatusCode::BAD_GATEWAY));
    for (name, value) in &head.headers {
        if !proto::hop_by_hop(name) {
            response = response.header(name, value);
        }
    }
    response.body(Body::from_stream(ResponseBody { rx, tunnel, id, done: false })).unwrap_or_else(|_| StatusCode::BAD_GATEWAY.into_response())
}

/// A host's response body as it arrives through the tunnel; a browser that goes away closes the stream.
struct ResponseBody {
    rx: mpsc::UnboundedReceiver<Incoming>,
    tunnel: Arc<Tunnel>,
    id: u32,
    done: bool,
}

impl Stream for ResponseBody {
    type Item = Result<Bytes, std::io::Error>;
    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        if self.done {
            return Poll::Ready(None);
        }
        match self.rx.poll_recv(cx) {
            Poll::Ready(Some(Incoming::Data(b))) => Poll::Ready(Some(Ok(b))),
            Poll::Ready(Some(Incoming::End)) => {
                self.done = true;
                Poll::Ready(None)
            }
            Poll::Ready(Some(_)) | Poll::Ready(None) => {
                self.done = true;
                Poll::Ready(Some(Err(std::io::Error::other("the host closed the stream"))))
            }
            Poll::Pending => Poll::Pending,
        }
    }
}

impl Drop for ResponseBody {
    fn drop(&mut self) {
        if !self.done {
            self.tunnel.send(Kind::Close, self.id, b"");
            let (t, id) = (self.tunnel.clone(), self.id);
            tokio::spawn(async move { t.forget(id).await });
        }
    }
}

/// A browser WebSocket joined to a host's through the tunnel; it closes at once when the browser is revoked.
async fn pump(socket: WebSocket, tunnel: Arc<Tunnel>, id: u32, mut rx: mpsc::UnboundedReceiver<Incoming>, browser: String, mut revoked: tokio::sync::broadcast::Receiver<String>) {
    let (mut sink, mut stream) = socket.split();
    loop {
        tokio::select! {
            m = stream.next() => match m {
                Some(Ok(Message::Text(t))) => tunnel.send(Kind::Text, id, t.as_bytes()),
                Some(Ok(Message::Binary(b))) => tunnel.send(Kind::Data, id, &b),
                Some(Ok(Message::Ping(_) | Message::Pong(_))) => {}
                _ => { tunnel.send(Kind::Close, id, b""); break; }
            },
            i = rx.recv() => match i {
                Some(Incoming::Text(t)) => if sink.send(Message::Text(t.into())).await.is_err() { tunnel.send(Kind::Close, id, b""); break; },
                Some(Incoming::Data(b)) => if sink.send(Message::Binary(b)).await.is_err() { tunnel.send(Kind::Close, id, b""); break; },
                _ => { let _ = sink.send(Message::Close(None)).await; break; }
            },
            r = revoked.recv() => match r {
                Ok(r) if r == browser => {
                    tunnel.send(Kind::Close, id, b"");
                    let _ = sink.send(Message::Close(None)).await;
                    break;
                }
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
                _ => {}
            },
        }
    }
    tunnel.forget(id).await;
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn address_prefers_the_ingress_header() {
        let peer: SocketAddr = "10.42.0.7:5555".parse().unwrap();
        let mut h = HeaderMap::new();
        assert_eq!(client_address(&h, peer), "10.42.0.7");
        h.insert("x-forwarded-for", HeaderValue::from_static("192.168.1.20, 10.42.0.1"));
        assert_eq!(client_address(&h, peer), "192.168.1.20");
    }
}
