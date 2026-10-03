//! The _Hub_Server_ (spec/adoc_hub.trm): the plugin server on the central machine. It follows the
//! ranch Directory, picks the _Routing_Client_ of each machine, keeps the hosts they report and the
//! names given to them, accepts their tunnels, and serves browsers on the exposed port `web`.
mod tunnel;
mod web;

use crate::auth::{Approvals, Browser};
use crate::product::{self, ID, VERSION};
use crate::proto::{AgentView, BrowserView, Datagram, HostView, LocalHost, PendingView};
use crate::ranch::{self, Endpoint, RanchEvent};
use crate::store::{self, HostName, Stored};
use anyhow::{Context, Result, anyhow};
use chrono::Utc;
use serde_json::{Value, json};
use std::collections::{BTreeMap, HashMap};
use std::path::PathBuf;
use std::sync::Arc;
use tokio::sync::{Mutex, broadcast, mpsc, watch};

pub use tunnel::Tunnel;

/// One machine of the ranch network as the hub sees it.
#[derive(Default)]
pub struct Machine {
    /// the client address of its _Routing_Client_
    pub routing: Option<String>,
    /// the token the routing client's tunnel must present
    pub token: Option<String>,
    pub hosts: Vec<LocalHost>,
    pub tunnel: Option<Arc<Tunnel>>,
}

pub struct Hub {
    pub data_dir: PathBuf,
    pub names: Vec<HostName>,
    pub approvals: Approvals,
    /// ranch Directory: session address → session entry
    pub directory: HashMap<String, Value>,
    pub machines: BTreeMap<String, Machine>,
    /// a browser seen since the last save
    pub seen_dirty: bool,
}

#[derive(Clone)]
pub struct Shared {
    pub hub: Arc<Mutex<Hub>>,
    pub endpoint: Endpoint,
    /// bumped on every change of what the status screens or `/adoc-discovery` show
    pub changes: Arc<watch::Sender<u64>>,
    /// the id of every revoked browser, so that its open WebSockets close at once
    pub revoked: broadcast::Sender<String>,
    /// open WebSockets per browser
    pub sockets: Arc<std::sync::Mutex<HashMap<String, usize>>>,
}

impl Shared {
    pub fn changed(&self) { self.changes.send_modify(|n| *n += 1); }
}

impl Hub {
    pub fn stored(&self) -> Stored { Stored { names: self.names.clone(), browsers: self.approvals.browsers.clone() } }
    pub fn save(&mut self) {
        self.seen_dirty = false;
        if let Err(e) = store::save(&self.data_dir, &self.stored()) {
            tracing::error!("saving {}: {e:#}", store::path(&self.data_dir).display());
        }
    }

    pub fn name_of(&self, machine: &str, workspace: &str) -> Option<String> {
        self.names.iter().find(|n| n.machine == machine && n.workspace == workspace).map(|n| n.name.clone())
    }

    /// The agent in a pane, from the Directory only (spec _Local_Discovery_).
    fn agent(&self, machine: &str, session: &str, pane: &str) -> Option<AgentView> {
        let entry = self.directory.values().find(|e| e["machine"] == machine && e["session"] == session)?;
        let agent = entry["agents"].as_array()?.iter().find(|a| a["pane"] == pane)?;
        Some(AgentView { name: agent["name"].as_str().unwrap_or("").to_string(), status: agent["status"].as_str().unwrap_or("unknown").to_string() })
    }

    pub fn hosts(&self) -> Vec<HostView> {
        let mut out = Vec::new();
        for (machine, m) in &self.machines {
            let reachable = m.routing.is_some() && m.tunnel.is_some();
            for h in &m.hosts {
                out.push(HostView {
                    address: format!("{machine}_{}", h.port),
                    id: h.id.clone(),
                    name: self.name_of(machine, &h.workspace),
                    title: h.title.clone(),
                    machine: machine.clone(),
                    workspace: h.workspace.clone(),
                    status: if reachable { h.status.clone() } else { "unreachable".into() },
                    version: h.version.clone(),
                    agent: h.claim.as_ref().and_then(|(s, p)| self.agent(machine, s, p)),
                });
            }
        }
        out
    }

    /// The host a path segment names: a _Hub_Host_Name_ or `<machine>_<port>`.
    pub fn resolve(&self, segment: &str) -> Option<(String, LocalHost)> {
        if let Some(n) = self.names.iter().find(|n| n.name == segment) {
            let h = self.machines.get(&n.machine)?.hosts.iter().find(|h| h.workspace == n.workspace)?;
            return Some((n.machine.clone(), h.clone()));
        }
        let (machine, port) = segment.rsplit_once('_')?;
        let port: u16 = port.parse().ok()?;
        let h = self.machines.get(machine)?.hosts.iter().find(|h| h.port == port)?;
        Some((machine.to_string(), h.clone()))
    }

    pub fn state(&self) -> Datagram {
        let now = Utc::now();
        Datagram::State {
            hosts: self.hosts(),
            pending: self.approvals.pending.iter().map(|p| PendingView { code: p.code.clone(), address: p.address.clone(), user_agent: p.user_agent.clone(), expires_in: (p.expires_at - now).num_seconds().max(0) as u64 }).collect(),
            browsers: self.approvals.browsers.iter().map(browser_view).collect(),
        }
    }

    /// The _Routing_Client_ of each machine: the persistent client of the session with the lowest
    /// name among that machine's sessions whose client is in the Directory. Returns the datagrams
    /// to send (to, datagram).
    fn pick_routing(&mut self) -> Vec<(String, Datagram)> {
        let mut wanted: BTreeMap<String, String> = BTreeMap::new();
        for e in self.directory.values() {
            let (Some(machine), Some(session)) = (e["machine"].as_str(), e["session"].as_str()) else { continue };
            let client = product::client_address(machine, session);
            let present = e["clients"].as_array().is_some_and(|c| c.iter().any(|a| a.as_str() == Some(client.as_str())));
            if present && wanted.get(machine).is_none_or(|w| session < session_of(w).as_str()) {
                wanted.insert(machine.to_string(), client);
            }
        }
        let mut out = Vec::new();
        let machines: Vec<String> = self.machines.keys().chain(wanted.keys()).cloned().collect();
        for machine in machines {
            let want = wanted.get(&machine).cloned();
            let m = self.machines.entry(machine.clone()).or_default();
            if m.routing == want {
                continue;
            }
            if let Some(old) = m.routing.take() {
                out.push((old, Datagram::Unroute));
            }
            m.tunnel = None;
            m.token = None;
            if let Some(new) = want {
                let token = crate::auth::new_token();
                tracing::info!("routing client of {machine}: {new}");
                out.push((new.clone(), Datagram::Route { token: token.clone() }));
                m.routing = Some(new);
                m.token = Some(token);
            } else {
                tracing::info!("no routing client for {machine}");
            }
        }
        out
    }

    /// A fresh route for a routing client that says hello again (after its welcome).
    fn reroute(&mut self, from: &str) -> Option<Datagram> {
        let m = self.machines.values_mut().find(|m| m.routing.as_deref() == Some(from))?;
        let token = crate::auth::new_token();
        m.token = Some(token.clone());
        Some(Datagram::Route { token })
    }

    fn apply_directory(&mut self, data: &Value) {
        for e in data["sessions"].as_array().into_iter().flatten() {
            if let Some(a) = e["address"].as_str() {
                self.directory.insert(a.to_string(), e.clone());
            }
        }
        for r in data["removed"].as_array().into_iter().flatten() {
            if let Some(a) = r.as_str() {
                self.directory.remove(a);
            }
        }
    }

    /// Takes a client's presence from peer_joined / peer_left into its Directory entry, so that the
    /// pick does not wait for the next directory_change.
    fn set_client(&mut self, client: &str, present: bool) {
        let Some((machine, session)) = ranch::session_of_address(client) else { return };
        let Some(e) = self.directory.values_mut().find(|e| e["machine"] == machine.as_str() && e["session"] == session.as_str()) else { return };
        let mut clients: Vec<Value> = e["clients"].as_array().cloned().unwrap_or_default();
        clients.retain(|c| c.as_str() != Some(client));
        if present {
            clients.push(json!(client));
        }
        e["clients"] = json!(clients);
    }

    /// `Name` from a status screen or the name command.
    fn name(&mut self, machine: &str, workspace: &str, name: Option<String>) -> Result<String, String> {
        if !self.machines.get(machine).is_some_and(|m| m.hosts.iter().any(|h| h.workspace == workspace)) {
            return Err(format!("the hub knows no adoc server of {workspace} on {machine}; start it with adoc server run"));
        }
        self.names.retain(|n| !(n.machine == machine && n.workspace == workspace));
        let Some(name) = name else {
            self.save();
            return Ok(format!("{workspace} on {machine} has no name now"));
        };
        store::valid_name(&name)?;
        if self.names.iter().any(|n| n.name == name) || self.resolve(&name).is_some() {
            return Err(format!("{name} already names another host"));
        }
        self.names.push(HostName { machine: machine.into(), workspace: workspace.into(), name: name.clone() });
        self.save();
        Ok(format!("{workspace} on {machine} is {name} now"))
    }
}

fn session_of(client: &str) -> String { ranch::session_of_address(client).map(|(_, s)| s).unwrap_or_default() }

pub fn browser_view(b: &Browser) -> BrowserView {
    BrowserView { id: b.id.clone(), address: b.address.clone(), user_agent: b.user_agent.clone(), approved_at: b.approved_at.to_rfc3339(), last_seen: b.last_seen.to_rfc3339() }
}

pub async fn run() -> Result<()> {
    tracing_subscriber::fmt().with_env_filter(tracing_subscriber::EnvFilter::try_from_default_env().unwrap_or_else(|_| "info".into())).with_writer(std::io::stderr).init();
    let data_dir = std::env::var_os("RANCH_PLUGIN_DATA_DIR").map(PathBuf::from).ok_or_else(|| anyhow!("RANCH_PLUGIN_DATA_DIR is not set; the hub runs as ranch's plugin server"))?;
    let web_addr = ranch::exposed("web").ok_or_else(|| anyhow!("RANCH_EXPOSED_PORTS has no 'web'; add [exposed_ports.{ID}] web = \"0.0.0.0:<port>\" to the Ranch Server's server.toml and restart it"))?;
    let stored = store::load(&data_dir).with_context(|| format!("reading {}", store::path(&data_dir).display()))?;
    let endpoint = Endpoint::server(ID, VERSION)?;
    let (changes, _) = watch::channel(0u64);
    let (revoked, _) = broadcast::channel(64);
    let shared = Shared {
        hub: Arc::new(Mutex::new(Hub { data_dir, names: stored.names, approvals: Approvals::new(stored.browsers), directory: HashMap::new(), machines: BTreeMap::new(), seen_dirty: false })),
        endpoint: endpoint.clone(),
        changes: Arc::new(changes),
        revoked,
        sockets: Arc::new(std::sync::Mutex::new(HashMap::new())),
    };

    let tunnel_listener = tokio::net::TcpListener::bind("127.0.0.1:0").await?;
    let tunnel_port = tunnel_listener.local_addr()?.port();
    tokio::spawn(tunnel::serve(tunnel_listener, shared.clone()));
    let web_listener = tokio::net::TcpListener::bind(&web_addr).await.with_context(|| format!("listening on {web_addr}"))?;
    tracing::info!("adoc-hub {VERSION}: browsers on {web_addr}, tunnels on 127.0.0.1:{tunnel_port}");
    tokio::spawn(web::serve(web_listener, shared.clone()));
    tokio::spawn(broadcast_state(shared.clone()));
    tokio::spawn(housekeeping(shared.clone()));

    let (tx, mut rx) = mpsc::channel(256);
    tokio::spawn(endpoint.clone().run_persistent(tx));
    let mut term = tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
    loop {
        let ev = tokio::select! {
            ev = rx.recv() => match ev { Some(ev) => ev, None => break },
            _ = term.recv() => break,
            _ = tokio::signal::ctrl_c() => break,
        };
        match ev {
            RanchEvent::Connected { address } => {
                tracing::info!("welcome as {address}");
                if let Err(e) = endpoint.forward(&[("tunnel", tunnel_port)]).await {
                    tracing::warn!("forward tunnel: {e:#}");
                }
                match endpoint.subscribe("ranch://").await {
                    Ok(snapshot) => {
                        let sends = {
                            let mut hub = shared.hub.lock().await;
                            hub.directory.clear();
                            hub.apply_directory(&snapshot);
                            hub.pick_routing()
                        };
                        send_all(&endpoint, sends).await;
                        shared.changed();
                    }
                    Err(e) => tracing::error!("subscribe: {e:#}"),
                }
            }
            RanchEvent::Notification { op, data } => {
                let sends = {
                    let mut hub = shared.hub.lock().await;
                    match op.as_str() {
                        "directory_change" => hub.apply_directory(&data),
                        "peer_joined" => hub.set_client(data["address"].as_str().unwrap_or(""), true),
                        "peer_left" => hub.set_client(data["address"].as_str().unwrap_or(""), false),
                        _ => {}
                    }
                    hub.pick_routing()
                };
                send_all(&endpoint, sends).await;
                shared.changed();
            }
            RanchEvent::Datagram { from, bytes, .. } => {
                let Some(d) = Datagram::parse(&bytes) else { continue };
                on_datagram(&shared, &from, d).await;
            }
            RanchEvent::Disconnected => tracing::warn!("ranch network disconnect"),
        }
    }
    shared.hub.lock().await.save();
    Ok(())
}

async fn send_all(endpoint: &Endpoint, sends: Vec<(String, Datagram)>) {
    for (to, d) in sends {
        if let Err(e) = endpoint.send(&to, &d.to_bytes()).await {
            tracing::warn!("send to {to}: {e:#}");
        }
    }
}

async fn on_datagram(shared: &Shared, from: &str, d: Datagram) {
    let Some((sender_machine, _)) = ranch::session_of_address(from) else { return };
    let mut replies = Vec::new();
    {
        let mut hub = shared.hub.lock().await;
        match d {
            Datagram::Hello => {
                replies.push((from.to_string(), hub.state()));
                if let Some(route) = hub.reroute(from) {
                    replies.push((from.to_string(), route));
                }
            }
            Datagram::Report { hosts, adoc } => {
                // spec _Routing_Client_: the reports of other clients of that machine are ignored
                let m = hub.machines.entry(sender_machine.clone()).or_default();
                if m.routing.as_deref() != Some(from) {
                    return;
                }
                if adoc.is_none() {
                    tracing::warn!("{from} finds no adoc program");
                }
                m.hosts = hosts;
            }
            Datagram::Decide { code, approve } => match hub.approvals.decide(&code, approve, Utc::now()) {
                Ok(b) => {
                    tracing::info!("{} code {code} ({from})", if approve { "approved" } else { "rejected" });
                    if b.is_some() {
                        hub.save();
                    }
                }
                Err(e) => tracing::info!("{from}: {e}"),
            },
            Datagram::Revoke { id } => {
                if hub.approvals.revoke(&id).is_some() {
                    tracing::info!("revoked browser {id} ({from})");
                    hub.save();
                    let _ = shared.revoked.send(id);
                }
            }
            Datagram::Name { machine, workspace, name } => {
                let machine = machine.unwrap_or(sender_machine);
                let result = hub.name(&machine, &workspace, name);
                replies.push((from.to_string(), match result {
                    Ok(message) => Datagram::NameResult { ok: true, message },
                    Err(message) => Datagram::NameResult { ok: false, message },
                }));
            }
            Datagram::Route { .. } | Datagram::Unroute | Datagram::State { .. } | Datagram::NameResult { .. } => return,
        }
    }
    send_all(&shared.endpoint, replies).await;
    shared.changed();
}

/// Sends the state to every client after a change, at most every 300 ms.
async fn broadcast_state(shared: Shared) {
    let mut rx = shared.changes.subscribe();
    let mut last: Option<Vec<u8>> = None;
    while rx.changed().await.is_ok() {
        tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        rx.mark_unchanged();
        let bytes = shared.hub.lock().await.state().to_bytes();
        if last.as_ref() == Some(&bytes) {
            continue;
        }
        if let Err(e) = shared.endpoint.send("ranch://", &bytes).await {
            tracing::debug!("state: {e:#}");
        }
        last = Some(bytes);
    }
}

/// Expires codes every second (their countdown is part of the state) and saves the last-seen times
/// once a minute.
async fn housekeeping(shared: Shared) {
    let mut tick = tokio::time::interval(std::time::Duration::from_secs(1));
    let mut n = 0u64;
    loop {
        tick.tick().await;
        n += 1;
        let mut hub = shared.hub.lock().await;
        let expired = hub.approvals.expire(Utc::now());
        let waiting = !hub.approvals.pending.is_empty();
        if n.is_multiple_of(60) && hub.seen_dirty {
            hub.save();
        }
        drop(hub);
        if expired || (waiting && n.is_multiple_of(5)) {
            shared.changed();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn hub() -> Hub { Hub { data_dir: std::env::temp_dir().join(format!("adoc-hub-test-{}", rand::random::<u32>())), names: vec![], approvals: Approvals::default(), directory: HashMap::new(), machines: BTreeMap::new(), seen_dirty: false } }
    fn session(machine: &str, session: &str, client: bool, agents: Value) -> Value {
        let clients: Vec<String> = if client { vec![product::client_address(machine, session)] } else { vec![] };
        json!({"address": format!("ranch://{machine}/{session}"), "machine": machine, "session": session, "clients": clients, "agents": agents})
    }
    fn local(workspace: &str, port: u16, claim: Option<(&str, &str)>) -> LocalHost {
        LocalHost { workspace: workspace.into(), url: format!("http://127.0.0.1:{port}"), port, status: "online".into(), id: Some("abc".into()), title: Some("t".into()), version: Some("0.1.2".into()), claim: claim.map(|(s, p)| (s.into(), p.into())) }
    }

    #[test]
    fn routing_client_is_the_lowest_session_with_a_client_and_moves_when_it_leaves() {
        let mut h = hub();
        h.apply_directory(&json!({"sessions": [session("mldev", "zeta", true, json!([])), session("mldev", "alpha", true, json!([])), session("mldev", "aaa", false, json!([]))]}));
        let sends = h.pick_routing();
        assert_eq!(sends.len(), 1);
        assert_eq!(sends[0].0, product::client_address("mldev", "alpha"));
        assert!(matches!(sends[0].1, Datagram::Route { .. }));
        assert!(h.pick_routing().is_empty(), "no change, nothing sent");
        h.set_client(&product::client_address("mldev", "alpha"), false);
        let sends = h.pick_routing();
        assert_eq!(sends[0], (product::client_address("mldev", "alpha"), Datagram::Unroute));
        assert_eq!(sends[1].0, product::client_address("mldev", "zeta"));
        h.apply_directory(&json!({"sessions": [], "removed": ["ranch://mldev/zeta"]}));
        let sends = h.pick_routing();
        assert_eq!(sends, vec![(product::client_address("mldev", "zeta"), Datagram::Unroute)]);
        assert!(h.machines["mldev"].routing.is_none());
    }

    #[test]
    fn hosts_take_agents_from_the_directory_and_are_unreachable_without_a_tunnel() {
        let mut h = hub();
        h.apply_directory(&json!({"sessions": [session("mldev", "ahq", true, json!([{"pane": "w2B:p1", "name": "adoc-dev", "status": "working"}]))]}));
        h.pick_routing();
        h.machines.get_mut("mldev").unwrap().hosts = vec![local("/w/adoc", 7700, Some(("ahq", "w2B:p1"))), local("/w/demo", 7701, Some(("ahq", "w9:p9")))];
        let v = h.hosts();
        assert_eq!(v[0].address, "mldev_7700");
        assert_eq!(v[0].status, "unreachable");
        assert_eq!(v[0].agent, Some(AgentView { name: "adoc-dev".into(), status: "working".into() }));
        assert_eq!(v[1].agent, None, "a pane the Directory does not know has no agent");
    }

    #[test]
    fn names_answer_beside_the_address_and_are_unique() {
        let mut h = hub();
        h.machines.entry("mldev".into()).or_default().hosts = vec![local("/w/adoc", 7700, None), local("/w/demo", 7701, None)];
        assert!(h.name("mldev", "/w/adoc", Some("adoc".into())).is_ok());
        assert_eq!(h.resolve("adoc").unwrap().1.port, 7700);
        assert_eq!(h.resolve("mldev_7700").unwrap().1.port, 7700);
        assert!(h.name("mldev", "/w/demo", Some("adoc".into())).is_err(), "unique");
        assert!(h.name("mldev", "/w/demo", Some("mldev_7700".into())).is_err());
        assert!(h.name("other", "/w/demo", Some("x".into())).is_err(), "unknown host");
        assert!(h.name("mldev", "/w/adoc", None).is_ok());
        assert!(h.resolve("adoc").is_none());
        assert!(h.resolve("nope_1").is_none());
        let _ = std::fs::remove_dir_all(&h.data_dir);
    }
}
