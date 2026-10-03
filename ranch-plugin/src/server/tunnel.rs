//! The server end of the _Hub_Tunnel_: a routing client dials the forwarded port `tunnel`, shows the
//! token it got by datagram in its first frame, and then carries numbered streams, one per HTTP
//! request or WebSocket.
use super::Shared;
use crate::auth;
use crate::proto::{self, Head, Kind, Open, TunnelHello};
use anyhow::{Result, anyhow};
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::Response;
use bytes::Bytes;
use futures_util::{SinkExt, StreamExt};
use std::collections::HashMap;
use std::sync::Arc;
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;
use tokio::sync::{Mutex, mpsc};

/// What a stream receives from the client.
#[derive(Debug)]
pub enum Incoming {
    Head(Head),
    Data(Bytes),
    End,
    Accept,
    Text(String),
    Close,
}

pub struct Tunnel {
    pub machine: String,
    tx: mpsc::UnboundedSender<Vec<u8>>,
    streams: Mutex<HashMap<u32, mpsc::UnboundedSender<Incoming>>>,
    next: AtomicU32,
}

impl Tunnel {
    pub fn send(&self, kind: Kind, stream: u32, payload: &[u8]) { let _ = self.tx.send(proto::frame(kind, stream, payload)); }

    async fn open(&self, kind: Kind, open: &Open) -> (u32, mpsc::UnboundedReceiver<Incoming>) {
        let id = self.next.fetch_add(1, Ordering::Relaxed);
        let (tx, rx) = mpsc::unbounded_channel();
        self.streams.lock().await.insert(id, tx);
        self.send(kind, id, &serde_json::to_vec(open).expect("open serializes"));
        (id, rx)
    }

    pub async fn forget(&self, id: u32) { self.streams.lock().await.remove(&id); }

    /// An HTTP request; the caller sends its body (Data…, End) and reads the response from the receiver.
    pub async fn http(&self, open: &Open) -> (u32, mpsc::UnboundedReceiver<Incoming>) { self.open(Kind::OpenHttp, open).await }

    /// A WebSocket: Ok when the host accepted it, else the host's (or our) refusal.
    pub async fn ws(&self, open: &Open) -> Result<(u32, mpsc::UnboundedReceiver<Incoming>), Head> {
        let (id, mut rx) = self.open(Kind::OpenWs, open).await;
        match tokio::time::timeout(Duration::from_secs(15), rx.recv()).await {
            Ok(Some(Incoming::Accept)) => Ok((id, rx)),
            Ok(Some(Incoming::Head(h))) => {
                self.forget(id).await;
                Err(h)
            }
            _ => {
                self.send(Kind::Close, id, b"");
                self.forget(id).await;
                Err(Head { status: 504, headers: vec![] })
            }
        }
    }

    /// The first frame the client sends for a stream: its response head.
    pub async fn head(&self, id: u32, rx: &mut mpsc::UnboundedReceiver<Incoming>) -> Result<Head> {
        match tokio::time::timeout(Duration::from_secs(60), rx.recv()).await {
            Ok(Some(Incoming::Head(h))) => Ok(h),
            Ok(_) => {
                self.forget(id).await;
                Err(anyhow!("the host closed the stream"))
            }
            Err(_) => {
                self.send(Kind::Close, id, b"");
                self.forget(id).await;
                Err(anyhow!("the host did not answer within 60 s"))
            }
        }
    }
}

pub async fn serve(listener: tokio::net::TcpListener, shared: Shared) {
    let app = axum::Router::new().route("/", axum::routing::get(upgrade)).with_state(shared);
    if let Err(e) = axum::serve(listener, app).await {
        tracing::error!("tunnel listener: {e}");
    }
}

async fn upgrade(State(shared): State<Shared>, ws: WebSocketUpgrade) -> Response { ws.max_message_size(proto::CHUNK * 64).on_upgrade(move |socket| accept(socket, shared)) }

/// spec _Hub_Tunnel_: every local process can reach a forwarded port, so a tunnel counts only when
/// its first frame carries the token the server sent to that machine's routing client.
async fn accept(socket: WebSocket, shared: Shared) {
    let (mut sink, mut stream) = socket.split();
    let first = tokio::time::timeout(Duration::from_secs(10), stream.next()).await;
    let Ok(Some(Ok(Message::Text(text)))) = first else { return };
    let Ok(hello) = serde_json::from_str::<TunnelHello>(text.as_str()) else { return };
    let (tx, mut out) = mpsc::unbounded_channel::<Vec<u8>>();
    let tunnel = {
        let mut hub = shared.hub.lock().await;
        let Some((machine, m)) = hub.machines.iter_mut().find(|(_, m)| m.token.as_deref().is_some_and(|t| auth::same(t, &hello.token))) else {
            tracing::warn!("a tunnel with an unknown token was refused");
            return;
        };
        let t = Arc::new(Tunnel { machine: machine.clone(), tx, streams: Mutex::new(HashMap::new()), next: AtomicU32::new(1) });
        m.tunnel = Some(t.clone());
        t
    };
    tracing::info!("tunnel from {} is open", tunnel.machine);
    shared.changed();
    let writer = tokio::spawn(async move {
        while let Some(bytes) = out.recv().await {
            if sink.send(Message::Binary(bytes.into())).await.is_err() {
                break;
            }
        }
    });
    let mut ping = tokio::time::interval(Duration::from_secs(20));
    loop {
        let msg = tokio::select! {
            m = stream.next() => m,
            _ = ping.tick() => { let _ = tunnel.tx.send(Vec::new()); continue; }
        };
        let Some(Ok(msg)) = msg else { break };
        let Message::Binary(bytes) = msg else { continue };
        let Some((kind, id, payload)) = proto::unframe(&bytes) else { continue };
        let incoming = match kind {
            Kind::Head => match serde_json::from_slice(payload) {
                Ok(h) => Incoming::Head(h),
                Err(_) => continue,
            },
            Kind::Data => Incoming::Data(Bytes::copy_from_slice(payload)),
            Kind::End => Incoming::End,
            Kind::Accept => Incoming::Accept,
            Kind::Text => Incoming::Text(String::from_utf8_lossy(payload).into_owned()),
            Kind::Close => Incoming::Close,
            Kind::OpenHttp | Kind::OpenWs => continue,
        };
        let done = matches!(incoming, Incoming::End | Incoming::Close);
        let mut streams = tunnel.streams.lock().await;
        if let Some(s) = streams.get(&id) {
            if s.send(incoming).is_err() {
                streams.remove(&id);
                tunnel.send(Kind::Close, id, b"");
            } else if done {
                streams.remove(&id);
            }
        }
    }
    writer.abort();
    for (_, s) in tunnel.streams.lock().await.drain() {
        let _ = s.send(Incoming::Close);
    }
    {
        let mut hub = shared.hub.lock().await;
        if let Some(m) = hub.machines.get_mut(&tunnel.machine)
            && m.tunnel.as_ref().is_some_and(|t| Arc::ptr_eq(t, &tunnel)) {
                m.tunnel = None;
            }
    }
    tracing::info!("tunnel from {} closed", tunnel.machine);
    shared.changed();
}
