//! The client end of the _Hub_Tunnel_: the routing client dials the forwarded port `tunnel`, shows
//! its token, and serves each stream against an adoc server on 127.0.0.1 of its machine.
use crate::proto::{self, Head, Kind, Open, TunnelHello};
use anyhow::{Result, anyhow};
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, RwLock};
use tokio::sync::mpsc;
use tokio_tungstenite::tungstenite::Message;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;

/// What a stream's task receives from the server.
enum ToStream {
    Data(Bytes),
    End,
    Text(String),
}

struct StreamTask {
    tx: mpsc::UnboundedSender<ToStream>,
    task: tokio::task::JoinHandle<()>,
}

/// The ports of the adoc servers this client reported last; a stream to any other port is refused,
/// so that neither a bug nor a compromised hub reaches another service on this machine.
pub type Allowed = Arc<RwLock<HashSet<u16>>>;

/// One tunnel connection, until it drops. `addr` is the forwarded `127.0.0.1:<port>`.
pub async fn run(addr: &str, token: &str, http: reqwest::Client, allowed: Allowed) -> Result<()> {
    let (socket, _) = tokio_tungstenite::connect_async(format!("ws://{addr}/")).await?;
    let (mut sink, mut stream) = socket.split();
    sink.send(Message::Text(serde_json::to_string(&TunnelHello { token: token.to_string() })?.into())).await?;
    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<Vec<u8>>();
    let writer = tokio::spawn(async move {
        while let Some(bytes) = out_rx.recv().await {
            if sink.send(Message::Binary(bytes.into())).await.is_err() {
                break;
            }
        }
    });
    let mut streams: HashMap<u32, StreamTask> = HashMap::new();
    let result = loop {
        let msg = match stream.next().await {
            Some(Ok(m)) => m,
            Some(Err(e)) => break Err(anyhow!(e)),
            None => break Ok(()),
        };
        let bytes = match msg {
            Message::Binary(b) => b,
            Message::Close(_) => break Ok(()),
            _ => continue,
        };
        let Some((kind, id, payload)) = proto::unframe(&bytes) else { continue };
        streams.retain(|_, s| !s.task.is_finished());
        match kind {
            Kind::OpenHttp | Kind::OpenWs => {
                let Ok(open) = serde_json::from_slice::<Open>(payload) else { continue };
                if !allowed.read().expect("allowed ports").contains(&open.port) {
                    send_head(&out_tx, Kind::Head, id, &Head { status: 403, headers: vec![] });
                    continue;
                }
                let (tx, rx) = mpsc::unbounded_channel();
                let out = out_tx.clone();
                let task = if kind == Kind::OpenHttp { tokio::spawn(serve_http(id, open, rx, out, http.clone())) } else { tokio::spawn(serve_ws(id, open, rx, out)) };
                streams.insert(id, StreamTask { tx, task });
            }
            Kind::Data => {
                if let Some(s) = streams.get(&id) {
                    let _ = s.tx.send(ToStream::Data(Bytes::copy_from_slice(payload)));
                }
            }
            Kind::End => {
                if let Some(s) = streams.get(&id) {
                    let _ = s.tx.send(ToStream::End);
                }
            }
            Kind::Text => {
                if let Some(s) = streams.get(&id) {
                    let _ = s.tx.send(ToStream::Text(String::from_utf8_lossy(payload).into_owned()));
                }
            }
            Kind::Close => {
                if let Some(s) = streams.remove(&id) {
                    s.task.abort();
                }
            }
            Kind::Head | Kind::Accept => {}
        }
    };
    for (_, s) in streams.drain() {
        s.task.abort();
    }
    writer.abort();
    result
}

fn send(out: &mpsc::UnboundedSender<Vec<u8>>, kind: Kind, id: u32, payload: &[u8]) { let _ = out.send(proto::frame(kind, id, payload)); }

fn send_head(out: &mpsc::UnboundedSender<Vec<u8>>, kind: Kind, id: u32, head: &Head) { send(out, kind, id, &serde_json::to_vec(head).expect("head serializes")); }

/// An HTTP request against `127.0.0.1:<port>`: the response head, its body in chunks, End.
async fn serve_http(id: u32, open: Open, rx: mpsc::UnboundedReceiver<ToStream>, out: mpsc::UnboundedSender<Vec<u8>>, http: reqwest::Client) {
    let method = reqwest::Method::from_bytes(open.method.as_bytes()).unwrap_or(reqwest::Method::GET);
    let mut req = http.request(method, format!("http://127.0.0.1:{}{}", open.port, open.path));
    for (name, value) in &open.headers {
        req = req.header(name, value);
    }
    if open.body {
        let body = futures_util::stream::unfold(rx, |mut rx| async move {
            match rx.recv().await {
                Some(ToStream::Data(b)) => Some((Ok::<Bytes, std::io::Error>(b), rx)),
                _ => None,
            }
        });
        req = req.body(reqwest::Body::wrap_stream(body));
    } else {
        drop(rx);
    }
    let response = match req.send().await {
        Ok(r) => r,
        Err(e) => {
            send_head(&out, Kind::Head, id, &Head { status: 502, headers: vec![("content-type".into(), "text/plain".into())] });
            send(&out, Kind::Data, id, format!("adoc-hub: the adoc server did not answer: {e}").as_bytes());
            send(&out, Kind::End, id, b"");
            return;
        }
    };
    let headers = response.headers().iter().filter(|(n, _)| !proto::hop_by_hop(n.as_str())).filter_map(|(n, v)| Some((n.as_str().to_string(), v.to_str().ok()?.to_string()))).collect();
    send_head(&out, Kind::Head, id, &Head { status: response.status().as_u16(), headers });
    let mut body = response.bytes_stream();
    while let Some(chunk) = body.next().await {
        let Ok(chunk) = chunk else {
            send(&out, Kind::Close, id, b"");
            return;
        };
        for part in chunk.chunks(proto::CHUNK) {
            send(&out, Kind::Data, id, part);
        }
    }
    send(&out, Kind::End, id, b"");
}

/// A WebSocket to `127.0.0.1:<port>`: Accept or a refusal, then messages both ways until either closes.
async fn serve_ws(id: u32, open: Open, mut rx: mpsc::UnboundedReceiver<ToStream>, out: mpsc::UnboundedSender<Vec<u8>>) {
    let mut request = match format!("ws://127.0.0.1:{}{}", open.port, open.path).into_client_request() {
        Ok(r) => r,
        Err(_) => return send_head(&out, Kind::Head, id, &Head { status: 400, headers: vec![] }),
    };
    for (name, value) in &open.headers {
        if let (Ok(n), Ok(v)) = (reqwest::header::HeaderName::from_bytes(name.as_bytes()), reqwest::header::HeaderValue::from_str(value)) {
            request.headers_mut().insert(n, v);
        }
    }
    let socket = match tokio_tungstenite::connect_async(request).await {
        Ok((s, _)) => s,
        Err(tokio_tungstenite::tungstenite::Error::Http(r)) => return send_head(&out, Kind::Head, id, &Head { status: r.status().as_u16(), headers: vec![] }),
        Err(_) => return send_head(&out, Kind::Head, id, &Head { status: 502, headers: vec![] }),
    };
    send(&out, Kind::Accept, id, b"");
    let (mut sink, mut stream) = socket.split();
    loop {
        tokio::select! {
            m = stream.next() => match m {
                Some(Ok(Message::Text(t))) => send(&out, Kind::Text, id, t.as_bytes()),
                Some(Ok(Message::Binary(b))) => send(&out, Kind::Data, id, &b),
                Some(Ok(Message::Ping(_) | Message::Pong(_) | Message::Frame(_))) => {}
                _ => { send(&out, Kind::Close, id, b""); break; }
            },
            m = rx.recv() => match m {
                Some(ToStream::Text(t)) => if sink.send(Message::Text(t.into())).await.is_err() { send(&out, Kind::Close, id, b""); break; },
                Some(ToStream::Data(b)) => if sink.send(Message::Binary(b)).await.is_err() { send(&out, Kind::Close, id, b""); break; },
                Some(ToStream::End) => {}
                None => { let _ = sink.send(Message::Close(None)).await; break; }
            },
        }
    }
}
