//! What travels between the plugin server and its clients: datagrams over ranch (signals and
//! reports only, spec _Hub_Tunnel_) and the frames of the _Hub_Tunnel_ WebSocket.
use serde::{Deserialize, Serialize};

/// One adoc server as _Local_Discovery_ sees it on its machine.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct LocalHost {
    pub workspace: String,
    /// the loopback URL, e.g. http://127.0.0.1:7700
    pub url: String,
    pub port: u16,
    /// "online" | "offline"
    pub status: String,
    /// from /api/workspace when online
    #[serde(default)]
    pub id: Option<String>,
    #[serde(default)]
    pub title: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    /// the claimed pane: (herdr session, pane id); who the agent is comes from the Directory
    #[serde(default)]
    pub claim: Option<(String, String)>,
}

/// One _Hub_Host_ as the hub serves it (`/adoc-discovery`, the status screens). The shape is a
/// contract with every adoc version (spec _Hub_Discovery_): fields may only be added.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct HostView {
    pub address: String,
    pub id: Option<String>,
    pub name: Option<String>,
    pub title: Option<String>,
    pub machine: String,
    pub workspace: String,
    /// "online" | "offline" | "unreachable" (no routing client or tunnel for its machine)
    pub status: String,
    pub version: Option<String>,
    pub agent: Option<AgentView>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct AgentView {
    pub name: String,
    pub status: String,
}

/// A browser waiting for _Browser_Approval_.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PendingView {
    pub code: String,
    pub user_agent: String,
    pub asked_at: String,
    pub expires_in: u64,
}

/// An approved browser.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BrowserView {
    pub id: String,
    pub user_agent: String,
    pub approved_at: String,
    pub last_seen: String,
}

/// Datagrams. `name_result` and `state` go to one client, the others to the server.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(tag = "t", rename_all = "snake_case")]
pub enum Datagram {
    /// client → server after every welcome: send me the state, and the route if I am the routing client
    Hello,
    /// routing client → server: the result of _Local_Discovery_, when picked and whenever it changes
    Report { hosts: Vec<LocalHost>, adoc: Option<String> },
    /// server → the picked client: report, and open the tunnel with this token
    Route { token: String },
    /// server → a client no longer picked
    Unroute,
    /// server → every client, on every change
    State { hosts: Vec<HostView>, pending: Vec<PendingView>, browsers: Vec<BrowserView> },
    /// client → server: the first answer decides
    Decide { code: String, approve: bool },
    /// client → server
    Revoke { id: String },
    /// client → server: name a host (machine defaults to the sender's), None removes the name
    Name { machine: Option<String>, workspace: String, name: Option<String> },
    /// server → the sender of `Name`
    NameResult { ok: bool, message: String },
}

impl Datagram {
    pub fn to_bytes(&self) -> Vec<u8> { serde_json::to_vec(self).expect("datagram serializes") }
    pub fn parse(bytes: &[u8]) -> Option<Datagram> { serde_json::from_slice(bytes).ok() }
}

/// The first (text) frame of a _Hub_Tunnel_, from the client.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TunnelHello {
    pub token: String,
}

/// Binary frames of the _Hub_Tunnel_: kind (1 byte), stream id (u32, big endian), payload.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
#[repr(u8)]
pub enum Kind {
    /// server → client: JSON `Open`, an HTTP request whose body follows as Data, then End
    OpenHttp = 1,
    /// either way: body bytes or a WebSocket binary message
    Data = 2,
    /// either way: the body is complete
    End = 3,
    /// client → server: JSON `Head`, the response head (also the refusal of a WebSocket)
    Head = 4,
    /// server → client: JSON `Open`, a WebSocket to open
    OpenWs = 5,
    /// client → server: the WebSocket is open
    Accept = 6,
    /// either way: a WebSocket text message
    Text = 7,
    /// either way: the stream is over (closed, failed, or no longer wanted)
    Close = 8,
}

impl Kind {
    fn from(b: u8) -> Option<Kind> {
        Some(match b {
            1 => Kind::OpenHttp,
            2 => Kind::Data,
            3 => Kind::End,
            4 => Kind::Head,
            5 => Kind::OpenWs,
            6 => Kind::Accept,
            7 => Kind::Text,
            8 => Kind::Close,
            _ => return None,
        })
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Open {
    /// the adoc server's port on the client's machine (always 127.0.0.1)
    pub port: u16,
    pub method: String,
    /// path and query, as the host sees it (without the hub's prefix)
    pub path: String,
    pub headers: Vec<(String, String)>,
    /// whether a body follows as Data frames and End (always false for a WebSocket)
    #[serde(default)]
    pub body: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Head {
    pub status: u16,
    pub headers: Vec<(String, String)>,
}

/// Bodies are cut into chunks of this size, so that one large response does not hold back the
/// frames of other streams (spec _Hub_Tunnel_).
pub const CHUNK: usize = 32 * 1024;

pub fn frame(kind: Kind, stream: u32, payload: &[u8]) -> Vec<u8> {
    let mut v = Vec::with_capacity(5 + payload.len());
    v.push(kind as u8);
    v.extend_from_slice(&stream.to_be_bytes());
    v.extend_from_slice(payload);
    v
}

pub fn unframe(bytes: &[u8]) -> Option<(Kind, u32, &[u8])> {
    if bytes.len() < 5 {
        return None;
    }
    let kind = Kind::from(bytes[0])?;
    let stream = u32::from_be_bytes([bytes[1], bytes[2], bytes[3], bytes[4]]);
    Some((kind, stream, &bytes[5..]))
}

/// Request and response headers that belong to one connection and are never passed on.
pub fn hop_by_hop(name: &str) -> bool {
    matches!(
        name.to_ascii_lowercase().as_str(),
        "connection" | "keep-alive" | "proxy-authenticate" | "proxy-authorization" | "te" | "trailer" | "transfer-encoding" | "upgrade" | "host" | "content-length"
    ) || name.to_ascii_lowercase().starts_with("sec-websocket-")
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn frames_round_trip() {
        let f = frame(Kind::Text, 70000, b"hi");
        assert_eq!(unframe(&f), Some((Kind::Text, 70000, &b"hi"[..])));
        assert_eq!(unframe(&[9, 0, 0, 0, 1]), None);
        assert_eq!(unframe(&[1, 0]), None);
    }
    #[test]
    fn datagrams_are_tagged_json() {
        let d = Datagram::Decide { code: "123456".into(), approve: true };
        let s = String::from_utf8(d.to_bytes()).unwrap();
        assert_eq!(s, r#"{"t":"decide","code":"123456","approve":true}"#);
        assert_eq!(Datagram::parse(s.as_bytes()), Some(d));
        assert_eq!(Datagram::parse(br#"{"t":"hello"}"#), Some(Datagram::Hello));
        assert_eq!(Datagram::parse(b"nonsense"), None);
    }
}
