//! A small client for the Ranch Api (herdr-ranch docs/PLUGINS.md §4), taken from herdr-connect's
//! `src/ranch.rs`: one SSE event stream per endpoint (`welcome`, `datagram`, `notification`),
//! datagrams to one address or a prefix, requests to ranch itself, forwarded ports. Vendored on
//! purpose: the API is plain HTTP and this keeps the private ranch repo out of our build.
use anyhow::{anyhow, Result};
use base64::Engine;
use futures_util::StreamExt;
use serde_json::{json, Value};
use std::path::PathBuf;
use tokio::sync::mpsc;

/// what the event stream delivers
#[derive(Debug, Clone)]
pub enum RanchEvent {
    /// the stream is open; `address` is this endpoint's identity
    Connected { address: String },
    Datagram { from: String, text: Option<String>, bytes: Vec<u8> },
    /// peer_joined, peer_left, directory_change, undeliverable, config_changed, plugin_updated, …
    Notification { op: String, data: Value },
    /// the stream ended (ranch client gone, or the ranch network disconnected)
    Disconnected,
}

fn from_env(var: &str) -> Option<PathBuf> { std::env::var_os(var).filter(|v| !v.is_empty()).map(PathBuf::from) }
/// ranch's state dir, exactly as ranch_proto::local computes it: `$RANCH_STATE_DIR`, else the
/// platform state dir (`~/.local/state` on Linux; `~/Library/Application Support` on macOS, where
/// `dirs::state_dir()` is None) joined with `herdr-ranch`
pub fn ranch_state_dir() -> PathBuf {
    from_env("RANCH_STATE_DIR").unwrap_or_else(|| dirs::state_dir().or_else(dirs::data_local_dir).unwrap_or_else(|| PathBuf::from(".")).join("herdr-ranch"))
}
/// where the ranch client writes `<session>.json`: `$RANCH_RUNTIME_DIR`, else
/// `$XDG_RUNTIME_DIR/herdr-ranch`, else `<ranch state dir>/run` (macOS has no XDG_RUNTIME_DIR)
pub fn ranch_runtime_dir() -> PathBuf {
    from_env("RANCH_RUNTIME_DIR").or_else(|| from_env("XDG_RUNTIME_DIR").map(|d| d.join("herdr-ranch"))).unwrap_or_else(|| ranch_state_dir().join("run"))
}
/// the ranch client of a herdr session (`{"url": …}`)
pub fn session_file(session: &str) -> PathBuf { ranch_runtime_dir().join(format!("{session}.json")) }
/// the ranch url for this process: `RANCH_URL` (plugin server), else the session file (plugin client)
pub fn discover(session: &str) -> Option<String> {
    if let Ok(u) = std::env::var("RANCH_URL") && !u.trim().is_empty() { return Some(u.trim().trim_end_matches('/').to_string()); }
    let s = std::fs::read_to_string(session_file(session)).ok()?;
    let v: Value = serde_json::from_str(&s).ok()?;
    v.get("url").and_then(|u| u.as_str()).map(|u| u.trim_end_matches('/').to_string())
}
/// ranch's config dir, exactly as ranch_proto::local computes it: `$RANCH_CONFIG_DIR`, else the
/// platform config dir (`~/.config` on Linux, `~/Library/Application Support` on macOS) + `herdr-ranch`
pub fn ranch_config_dir() -> PathBuf {
    from_env("RANCH_CONFIG_DIR").unwrap_or_else(|| dirs::config_dir().unwrap_or_else(|| PathBuf::from(".")).join("herdr-ranch"))
}
/// a session's ranch settings (`herdr-ranch setup|enable|disable`): `<config dir>/client-<session>.toml`
pub fn client_settings(session: &str) -> PathBuf { ranch_config_dir().join(format!("client-{session}.toml")) }
/// Is ranch on for this herdr session? A SETTING, not a process (herdr-ranch docs/PLUGINS.md §3 item 4,
/// mirror of ranch_proto::local::is_on): the settings file has a non-empty `target` and no
/// `enabled = false`. The Ranch Client restarts and starts after herdr's startup hooks, so whether
/// it answers says nothing (2026-10-01: two plugins each opened a second console on segv-mbp that way).
pub fn is_on(session: &str) -> bool {
    #[derive(serde::Deserialize)]
    struct Switch { #[serde(default)] target: String, #[serde(default = "yes")] enabled: bool }
    fn yes() -> bool { true }
    std::fs::read_to_string(client_settings(session)).ok().and_then(|s| toml::from_str::<Switch>(&s).ok()).is_some_and(|s| !s.target.trim().is_empty() && s.enabled)
}

/// `ranch://<machine>/<session>/plugin/<id>/<instance>` → (machine, session)
pub fn session_of_address(addr: &str) -> Option<(String, String)> {
    let rest = addr.strip_prefix("ranch://")?;
    let mut it = rest.split('/');
    let m = it.next().filter(|s| !s.is_empty())?.to_string();
    let s = it.next().filter(|s| !s.is_empty())?.to_string();
    Some((m, s))
}
/// the persistent plugin client of a session, as a datagram address
/// `ranch://<machine>/<session>/agent/<pane id, percent-encoded>` — pane-based, never changes with the name
pub fn agent_address(machine: &str, session: &str, pane: &str) -> String { format!("ranch://{machine}/{session}/agent/{}", urlenc(pane)) }
pub fn client_address(plugin: &str, machine: &str, session: &str) -> String { format!("ranch://{machine}/{session}/plugin/{plugin}/0") }

#[derive(Clone)]
pub struct Endpoint { base: String, version: String, http: reqwest::Client }

impl Endpoint {
    /// plugin server: `$RANCH_URL/plugin/<id>`
    pub fn server(plugin: &str, version: &str) -> Result<Endpoint> {
        let url = discover("").ok_or_else(|| anyhow!("RANCH_URL is not set"))?;
        Ok(Endpoint { base: format!("{url}/plugin/{plugin}"), version: version.into(), http: reqwest::Client::new() })
    }
    /// persistent plugin client (instance 0) of a herdr session
    pub fn client(plugin: &str, version: &str, session: &str) -> Result<Endpoint> {
        let url = discover(session).ok_or_else(|| anyhow!("no ranch client for herdr session {session} ({})", session_file(session).display()))?;
        Ok(Endpoint { base: format!("{url}/plugin/{plugin}/0"), version: version.into(), http: reqwest::Client::new() })
    }
    /// a transient plugin client (a random instance other than 0) of a herdr session, for one short command
    pub fn transient(plugin: &str, version: &str, session: &str) -> Result<Endpoint> {
        let url = discover(session).ok_or_else(|| anyhow!("no ranch client for herdr session {session} ({})", session_file(session).display()))?;
        let instance = 1 + rand::random::<u32>() % 1_000_000_000;
        Ok(Endpoint { base: format!("{url}/plugin/{plugin}/{instance}"), version: version.into(), http: reqwest::Client::new() })
    }
    pub fn base(&self) -> &str { &self.base }

    /// Open the event stream once and feed `tx` until it ends. Returns why it ended.
    pub async fn recv_once(&self, tx: &mpsc::Sender<RanchEvent>) -> Result<()> {
        let url = format!("{}/recv?version={}", self.base, urlenc(&self.version));
        let r = self.http.get(&url).send().await?;
        if !r.status().is_success() {
            let st = r.status();
            let v: Value = r.json().await.unwrap_or(json!({}));
            return Err(anyhow!("ranch recv: {} {}", st, v["reason"].as_str().unwrap_or("")));
        }
        let mut body = r.bytes_stream();
        let mut buf = String::new();
        let (mut name, mut data) = (String::new(), String::new());
        while let Some(chunk) = body.next().await {
            let Ok(chunk) = chunk else { break };
            buf.push_str(&String::from_utf8_lossy(&chunk));
            while let Some(i) = buf.find('\n') {
                let line = buf[..i].trim_end_matches('\r').to_string();
                buf.drain(..=i);
                if line.is_empty() {
                    if !data.is_empty() && let Some(ev) = parse_event(&name, &data) && tx.send(ev).await.is_err() { return Ok(()); }
                    name.clear(); data.clear();
                } else if let Some(v) = line.strip_prefix("event:") { name = v.trim().to_string(); }
                else if let Some(v) = line.strip_prefix("data:") { if !data.is_empty() { data.push('\n'); } data.push_str(v.strip_prefix(' ').unwrap_or(v)); }
            }
        }
        Ok(())
    }
    /// Keep the stream open for a persistent endpoint: reconnect with 1 s → 30 s backoff; every
    /// end is reported as `Disconnected`.
    pub async fn run_persistent(self, tx: mpsc::Sender<RanchEvent>) {
        let mut wait = std::time::Duration::from_secs(1);
        loop {
            match self.recv_once(&tx).await {
                Ok(()) => { wait = std::time::Duration::from_secs(1); }
                Err(e) => { tracing::debug!("{e}"); }
            }
            if tx.send(RanchEvent::Disconnected).await.is_err() { return; }
            tokio::time::sleep(wait).await;
            wait = (wait * 2).min(std::time::Duration::from_secs(30));
        }
    }
    /// a datagram to one address of this plugin, or to every endpoint under a prefix
    pub async fn send(&self, to: &str, bytes: &[u8]) -> Result<()> {
        let r = self.http.post(format!("{}/send?to={}", self.base, urlenc(to))).body(bytes.to_vec()).send().await?;
        if r.status().is_success() { Ok(()) } else { let st = r.status(); let v: Value = r.json().await.unwrap_or(json!({})); Err(anyhow!("ranch send: {} {}", st, v["reason"].as_str().unwrap_or(""))) }
    }
    pub async fn send_json(&self, to: &str, v: &Value) -> Result<()> { self.send(to, v.to_string().as_bytes()).await }
    /// a request to ranch itself (subscribe, status, forward, set_status_icon, …)
    pub async fn request(&self, op: &str, args: Value) -> Result<Value> {
        let r = self.http.post(format!("{}/request/{op}", self.base)).json(&args).send().await?;
        let st = r.status();
        let v: Value = r.json().await.unwrap_or(json!({}));
        if st.is_success() && v["ok"].as_bool() != Some(false) { Ok(v.get("result").cloned().unwrap_or(v)) } else { Err(anyhow!("ranch {op}: {} {}", st, v["reason"].as_str().unwrap_or(""))) }
    }
    /// Set_Agent_Name (herdr-ranch docs/PLUGINS.md §4.4, plugin servers only): ranch's name for the
    /// agent in a pane; "" clears it back to the pane id. Not persisted by ranch.
    pub async fn set_agent_name(&self, machine: &str, session: &str, pane: &str, name: &str) -> Result<Value> {
        self.request("set_agent_name", json!({"agent": agent_address(machine, session, pane), "name": name})).await
    }
    pub async fn subscribe(&self, prefix: &str) -> Result<Value> { self.request("subscribe", json!({"prefix": prefix})).await }
    pub async fn forward(&self, ports: &[(&str, u16)]) -> Result<Value> {
        let m: serde_json::Map<String, Value> = ports.iter().map(|(n, p)| (n.to_string(), json!(p))).collect();
        self.request("forward", json!({"ports": m})).await
    }
    /// plugin client: the local host:port of a named forwarded port
    pub async fn forwarded(&self, name: &str) -> Result<String> {
        let v: Value = self.http.get(format!("{}/forward", self.base)).send().await?.json().await?;
        v.get(name).and_then(|s| s.as_str()).map(|s| s.to_string()).ok_or_else(|| anyhow!("no forwarded port named {name}"))
    }
}

/// plugin server: the listening address of a named exposed port from `RANCH_EXPOSED_PORTS`
pub fn exposed(name: &str) -> Option<String> {
    let v: Value = serde_json::from_str(&std::env::var("RANCH_EXPOSED_PORTS").ok()?).ok()?;
    v.get(name).and_then(|s| s.as_str()).map(|s| s.to_string())
}

fn parse_event(name: &str, data: &str) -> Option<RanchEvent> {
    let v: Value = serde_json::from_str(data).ok()?;
    match name {
        "welcome" => Some(RanchEvent::Connected { address: v["address"].as_str().unwrap_or("").to_string() }),
        "datagram" => {
            let text = v["text"].as_str().map(|s| s.to_string());
            let bytes = v["base64"].as_str().and_then(|b| base64::engine::general_purpose::STANDARD.decode(b).ok()).unwrap_or_else(|| text.clone().unwrap_or_default().into_bytes());
            Some(RanchEvent::Datagram { from: v["from"].as_str().unwrap_or("").to_string(), text, bytes })
        }
        "notification" => Some(RanchEvent::Notification { op: v["op"].as_str().unwrap_or("").to_string(), data: v.get("data").cloned().unwrap_or(Value::Null) }),
        _ => None,
    }
}
pub fn urlenc(s: &str) -> String { s.chars().map(|c| if c.is_ascii_alphanumeric() || "-_.~".contains(c) { c.to_string() } else { c.to_string().into_bytes().iter().map(|b| format!("%{b:02X}")).collect() }).collect() }

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn addresses() {
        assert_eq!(session_of_address("ranch://mldev/ahq-dev/plugin/herdr-connect-new/0"), Some(("mldev".into(), "ahq-dev".into())));
        assert_eq!(session_of_address("ranch://central/plugin/herdr-connect-new"), Some(("central".into(), "plugin".into())));
        assert_eq!(session_of_address("nope"), None);
        assert_eq!(client_address("herdr-connect-new", "segv-mbp", "default"), "ranch://segv-mbp/default/plugin/herdr-connect-new/0");
        assert_eq!(agent_address("mldev", "ahq-dev", "w1V:p1"), "ranch://mldev/ahq-dev/agent/w1V%3Ap1");
        assert_eq!(urlenc("ranch://mldev/"), "ranch%3A%2F%2Fmldev%2F");
    }
    #[test]
    fn session_file_follows_ranch_proto() {
        unsafe { std::env::set_var("RANCH_RUNTIME_DIR", "/rt"); }
        assert_eq!(session_file("x"), PathBuf::from("/rt/x.json"));
        unsafe { std::env::remove_var("RANCH_RUNTIME_DIR"); std::env::set_var("XDG_RUNTIME_DIR", "/run/user/1"); }
        assert_eq!(session_file("x"), PathBuf::from("/run/user/1/herdr-ranch/x.json"));
        unsafe { std::env::remove_var("XDG_RUNTIME_DIR"); std::env::set_var("RANCH_STATE_DIR", "/st"); }
        assert_eq!(session_file("voice-test"), PathBuf::from("/st/run/voice-test.json"), "no runtime dir: <state>/run (the macOS case)");
        unsafe { std::env::remove_var("RANCH_STATE_DIR"); }
    }
    #[test]
    fn is_on_is_the_sessions_setting_not_a_process() {
        let dir = std::env::temp_dir().join(format!("hc-ranch-cfg-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        unsafe { std::env::set_var("RANCH_CONFIG_DIR", &dir); }
        assert_eq!(client_settings("s"), dir.join("client-s.toml"));
        assert!(!is_on("s"), "no settings file: off");
        std::fs::write(dir.join("client-s.toml"), "target = \"ranch@ranch.example\"\nmachine = \"\"\n").unwrap();
        assert!(is_on("s"), "a target and no enabled: on, whether or not the ranch client answers");
        std::fs::write(dir.join("client-s.toml"), "target = \"ranch@ranch.example\"\nenabled = false\n").unwrap();
        assert!(!is_on("s"), "disabled: off");
        std::fs::write(dir.join("client-s.toml"), "target = \"\"\nenabled = true\n").unwrap();
        assert!(!is_on("s"), "no target: off");
        std::fs::write(dir.join("client-s.toml"), "not toml [[[").unwrap();
        assert!(!is_on("s"), "unreadable settings: off");
        unsafe { std::env::remove_var("RANCH_CONFIG_DIR"); }
        let _ = std::fs::remove_dir_all(&dir);
    }
    #[test]
    fn events_parse() {
        match parse_event("welcome", r#"{"address":"ranch://m/s/plugin/p/0","protocol":1}"#) { Some(RanchEvent::Connected { address }) => assert_eq!(address, "ranch://m/s/plugin/p/0"), _ => panic!() }
        match parse_event("datagram", r#"{"from":"ranch://central/plugin/p","base64":"aGk=","text":"hi"}"#) { Some(RanchEvent::Datagram { from, text, bytes }) => { assert_eq!(from, "ranch://central/plugin/p"); assert_eq!(text.as_deref(), Some("hi")); assert_eq!(bytes, b"hi"); } _ => panic!() }
        match parse_event("notification", r#"{"op":"peer_left","data":{"address":"x"}}"#) { Some(RanchEvent::Notification { op, data }) => { assert_eq!(op, "peer_left"); assert_eq!(data["address"], "x"); } _ => panic!() }
        assert!(parse_event("other", "{}").is_none());
    }
}
