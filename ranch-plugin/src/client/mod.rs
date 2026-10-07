//! The _Hub_Client_ (spec/adoc_hub.trm): the persistent client in every herdr session. It says
//! hello after every welcome, draws the _Hub_Status_Screen_ from the state the server sends, and,
//! when the server picks it as the _Routing_Client_ of its machine, reports _Local_Discovery_ and
//! carries the tunnel.
mod tunnel;

use crate::discovery;
use crate::product::{self, ID, VERSION};
use crate::proto::{BrowserView, Datagram, HostView, LocalHost, PendingView};
use crate::ranch::{self, Endpoint, RanchEvent};
use crate::session;
use crate::tui;
use anyhow::{Result, anyhow};
use serde_json::json;
use std::collections::VecDeque;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{Mutex, Notify, mpsc, watch};

/// What the status screen shows.
pub struct Board {
    pub session: String,
    pub machine: String,
    pub ranch: String,
    /// "this session" when routed, with the tunnel's state
    pub routing: String,
    pub adoc: String,
    pub hosts: Vec<HostView>,
    pub pending: Vec<PendingView>,
    pub browsers: Vec<BrowserView>,
    pub log: VecDeque<String>,
    pub plain: bool,
}

impl Board {
    pub fn ev(&mut self, text: impl AsRef<str>) {
        let line = format!("{}  {}", chrono::Local::now().format("%H:%M:%S"), text.as_ref());
        if self.plain {
            println!("{line}");
        }
        if self.log.len() >= 200 {
            self.log.pop_front();
        }
        self.log.push_back(line);
    }
}

#[derive(Clone)]
pub struct Shared {
    pub board: Arc<Mutex<Board>>,
    pub redraw: Arc<Notify>,
}

pub async fn run() -> Result<()> {
    let session = session::name();
    let plain = !tui::wanted();
    let shared = Shared {
        board: Arc::new(Mutex::new(Board { session: session.clone(), machine: String::new(), ranch: "waiting for ranch".into(), routing: "not picked".into(), adoc: "not looked for yet".into(), hosts: vec![], pending: vec![], browsers: vec![], log: VecDeque::new(), plain })),
        redraw: Arc::new(Notify::new()),
    };
    let (cmd_tx, cmd_rx) = mpsc::unbounded_channel::<Datagram>();
    let ranch_task = tokio::spawn(ranch_loop(shared.clone(), session, cmd_rx));
    // The client ends when its ranch side ends (a failed re-exec after plugin_updated): ranch then opens the pane again
    // with the installed binary. The status screen alone must never keep a client alive that no longer talks to ranch.
    let ended = if plain {
        tokio::select! {
            r = ranch_task => Some(r),
            _ = tokio::signal::ctrl_c() => None,
        }
    } else {
        let r = tokio::select! {
            r = ranch_task => Some(r),
            _ = tui::run(shared, cmd_tx) => None,
        };
        tui::restore();
        r
    };
    match ended {
        Some(r) => r.map_err(|e| anyhow!(e))?.and_then(|()| Err(anyhow!("the ranch connection ended"))),
        None => {
            println!("adoc-hub client: ended");
            Ok(())
        }
    }
}

/// The client's life under ranch: one connection after another. A restarted Ranch Client listens on a
/// new url, published in the session file, so every connection starts by reading that file again;
/// the url is never kept across a disconnect (herdr-ranch #580, the fix herdr-connect made in 0.7.10).
async fn ranch_loop(shared: Shared, session: String, mut commands: mpsc::UnboundedReceiver<Datagram>) -> Result<()> {
    loop {
        match Endpoint::client(ID, VERSION, &session) {
            Ok(endpoint) => {
                connection(&shared, &endpoint, &mut commands).await?;
                let mut b = shared.board.lock().await;
                b.ranch = "disconnected · looking the ranch client up again".into();
                b.routing = "not picked".into();
                b.ev("ranch event stream ended; looking the ranch client up again");
            }
            Err(_) => shared.board.lock().await.ranch = "waiting for ranch".into(),
        }
        shared.redraw.notify_one();
        tokio::time::sleep(Duration::from_secs(2)).await;
    }
}

/// One connection to the Ranch Client at `endpoint`, until its event stream ends; returns Err only when
/// re-executing after `plugin_updated` failed. Everything tied to the connection (the stream, discovery,
/// the tunnel) ends with it.
async fn connection(shared: &Shared, endpoint: &Endpoint, commands: &mut mpsc::UnboundedReceiver<Datagram>) -> Result<()> {
    let server = product::server_address();
    let (tx, mut rx) = mpsc::channel(256);
    // one stream, ended by the first disconnect: the next connection reads the session file again
    let stream = {
        let endpoint = endpoint.clone();
        tokio::spawn(async move {
            if let Err(e) = endpoint.recv_once(&tx).await {
                tracing::debug!("{e:#}");
            }
            let _ = tx.send(RanchEvent::Disconnected).await;
        })
    };
    // the route epoch: 0 while not picked; a new value for every Route, so that discovery reports at once
    let (route_tx, route_rx) = watch::channel(0u64);
    let allowed: tunnel::Allowed = Default::default();
    let discovery = tokio::spawn(discovery_loop(shared.clone(), endpoint.clone(), route_rx, allowed.clone()));
    let mut tunnel_task: Option<tokio::task::JoinHandle<()>> = None;
    // the sidebar icon belongs to this connection: set it again on the first state
    let mut icon_pending = usize::MAX;
    let result = loop {
        let ev = tokio::select! {
            ev = rx.recv() => ev.unwrap_or(RanchEvent::Disconnected),
            c = commands.recv() => {
                if let Some(c) = c
                    && let Err(e) = endpoint.send(&server, &c.to_bytes()).await {
                        shared.board.lock().await.ev(format!("not sent: {e:#}"));
                    }
                shared.redraw.notify_one();
                continue;
            }
        };
        match ev {
            RanchEvent::Connected { address } => {
                {
                    let mut b = shared.board.lock().await;
                    b.machine = ranch::session_of_address(&address).map(|(m, _)| m).unwrap_or_default();
                    b.ranch = format!("connected {}", chrono::Local::now().format("%H:%M:%S"));
                    b.ev(format!("welcome as {address}"));
                }
                let _ = endpoint.send(&server, &Datagram::Hello.to_bytes()).await;
            }
            RanchEvent::Disconnected => break Ok(()),
            RanchEvent::Notification { op, .. } => match op.as_str() {
                "plugin_updated" => {
                    shared.board.lock().await.ev("plugin updated; re-executing in place");
                    tui::restore();
                    break Err(anyhow!("re-exec failed: {}", reexec()));
                }
                "peer_joined" => {
                    let _ = endpoint.send(&server, &Datagram::Hello.to_bytes()).await;
                }
                _ => {}
            },
            RanchEvent::Datagram { from, bytes, .. } => {
                if from != server {
                    continue;
                }
                let Some(d) = Datagram::parse(&bytes) else { continue };
                match d {
                    Datagram::Route { token } => {
                        if let Some(t) = tunnel_task.take() {
                            t.abort();
                        }
                        route_tx.send_modify(|n| *n += 1);
                        shared.board.lock().await.routing = "this session · tunnel dialing".into();
                        tunnel_task = Some(tokio::spawn(tunnel_loop(shared.clone(), endpoint.clone(), token, allowed.clone())));
                    }
                    Datagram::Unroute => {
                        if let Some(t) = tunnel_task.take() {
                            t.abort();
                        }
                        route_tx.send_replace(0);
                        let mut b = shared.board.lock().await;
                        b.routing = "not picked".into();
                        b.ev("another session routes this machine now");
                    }
                    Datagram::State { hosts, pending, browsers } => {
                        let n = pending.len();
                        {
                            let mut b = shared.board.lock().await;
                            for p in &pending {
                                if !b.pending.iter().any(|q| q.code == p.code) {
                                    b.ev(format!("a browser asks for approval: code {} ({})", p.code, p.user_agent));
                                }
                            }
                            b.hosts = hosts;
                            b.pending = pending;
                            b.browsers = browsers;
                        }
                        if n != icon_pending {
                            icon_pending = n;
                            let icon = if n > 0 { json!(format!("🔑{n}")) } else { json!(null) };
                            let _ = endpoint.request("set_status_icon", json!({"icon": icon})).await;
                        }
                    }
                    Datagram::NameResult { ok, message } => shared.board.lock().await.ev(if ok { message } else { format!("name refused: {message}") }),
                    _ => {}
                }
            }
        }
        shared.redraw.notify_one();
    };
    stream.abort();
    discovery.abort();
    if let Some(t) = tunnel_task {
        t.abort();
    }
    result
}

/// The tunnel while this session is the routing client: dial the forwarded port, looked up anew for
/// every dial (it changes with every ranch connection), again after every drop.
async fn tunnel_loop(shared: Shared, endpoint: Endpoint, token: String, allowed: tunnel::Allowed) {
    let http = reqwest::Client::builder().redirect(reqwest::redirect::Policy::none()).build().expect("http client");
    let mut wait = Duration::from_secs(1);
    loop {
        let result = match endpoint.forwarded("tunnel").await {
            Ok(addr) => {
                shared.board.lock().await.routing = "this session · tunnel open".into();
                shared.redraw.notify_one();
                tunnel::run(&addr, &token, http.clone(), allowed.clone()).await
            }
            Err(e) => Err(e),
        };
        {
            let mut b = shared.board.lock().await;
            b.routing = format!("this session · tunnel closed, again in {} s", wait.as_secs());
            if let Err(e) = result {
                b.ev(format!("tunnel: {e:#}"));
            }
        }
        shared.redraw.notify_one();
        tokio::time::sleep(wait).await;
        wait = (wait * 2).min(Duration::from_secs(30));
    }
}

/// _Local_Discovery_ every 3 s while routed; a report only when the result changes or a new route came.
async fn discovery_loop(shared: Shared, endpoint: Endpoint, mut route: watch::Receiver<u64>, allowed: tunnel::Allowed) {
    let http = reqwest::Client::new();
    let server = product::server_address();
    let mut adoc: Option<std::path::PathBuf> = None;
    let mut last: Option<(u64, Vec<LocalHost>, Option<String>)> = None;
    let mut since_lookup = 0u32;
    loop {
        tokio::select! {
            _ = tokio::time::sleep(Duration::from_secs(3)) => {}
            r = route.changed() => if r.is_err() { return },
        }
        let epoch = *route.borrow();
        if epoch == 0 {
            last = None;
            continue;
        }
        // look for adoc again when it went away, and every 30 s while there is none
        if adoc.as_ref().is_some_and(|p| !p.exists()) {
            adoc = None;
            since_lookup = 0;
        }
        if adoc.is_none() && since_lookup == 0 {
            adoc = discovery::find_adoc().await;
        }
        since_lookup = (since_lookup + 1) % 10;
        let (hosts, found) = match &adoc {
            Some(p) => match discovery::discover(p, &http).await {
                Ok(h) => {
                    shared.board.lock().await.adoc = p.display().to_string();
                    (h, Some(p.display().to_string()))
                }
                Err(e) => {
                    shared.board.lock().await.adoc = format!("{} failed: {e:#}", p.display());
                    continue;
                }
            },
            None => {
                shared.board.lock().await.adoc = "no adoc program: set ADOC_BIN, or put adoc on PATH or in the login shell".into();
                (vec![], None)
            }
        };
        *allowed.write().expect("allowed ports") = hosts.iter().map(|h| h.port).collect();
        let now = (epoch, hosts, found);
        if last.as_ref() != Some(&now) {
            let d = Datagram::Report { hosts: now.1.clone(), adoc: now.2.clone() };
            if endpoint.send(&server, &d.to_bytes()).await.is_ok() {
                last = Some(now);
            }
        }
        shared.redraw.notify_one();
    }
}

/// Unix exec of this program with the same arguments (returns only on failure).
/// herdr installs an update in place: the binary at the path the pane started (`argv[0]`, absolute) is the new one, while
/// `current_exe()` names the replaced file, which Linux reports as `… (deleted)` (herdr-ranch #661). Re-exec that path.
fn reexec() -> std::io::Error {
    use std::os::unix::process::CommandExt;
    let program = std::env::args_os().next().map(std::path::PathBuf::from).filter(|p| p.is_absolute() && p.exists()).or_else(|| {
        let exe = std::env::current_exe().ok()?;
        let text = exe.to_string_lossy();
        Some(std::path::PathBuf::from(text.strip_suffix(" (deleted)").unwrap_or(&text)))
    });
    let Some(program) = program else { return std::io::Error::other("no path of this program to re-execute") };
    std::process::Command::new(program).args(std::env::args_os().skip(1)).exec()
}

/// `adoc-hub name <name> | --clear`, as a transient client of this session.
pub async fn name_command(name: Option<String>, clear: bool) -> Result<()> {
    if name.is_none() && !clear {
        return Err(anyhow!("give a name, or --clear to remove it"));
    }
    let cwd = std::env::current_dir()?;
    let workspace = discovery::workspace_of(&cwd).ok_or_else(|| anyhow!("{} is not inside an adoc workspace (no .adoc/adoc.yaml above it)", cwd.display()))?;
    let session = session::name();
    let endpoint = Endpoint::transient(ID, VERSION, &session)?;
    let (tx, mut rx) = mpsc::channel(16);
    let listener = endpoint.clone();
    let recv = tokio::spawn(async move { listener.recv_once(&tx).await });
    let answer = tokio::time::timeout(Duration::from_secs(15), async {
        let server = product::server_address();
        while let Some(ev) = rx.recv().await {
            match ev {
                RanchEvent::Connected { .. } => endpoint.send(&server, &Datagram::Name { machine: None, workspace: workspace.display().to_string(), name: name.clone() }.to_bytes()).await?,
                RanchEvent::Datagram { from, bytes, .. } if from == server => {
                    if let Some(Datagram::NameResult { ok, message }) = Datagram::parse(&bytes) {
                        return Ok((ok, message));
                    }
                }
                _ => {}
            }
        }
        Err(anyhow!("the ranch stream ended"))
    })
    .await;
    recv.abort();
    match answer {
        Ok(Ok((true, message))) => {
            println!("{message}");
            Ok(())
        }
        Ok(Ok((false, message))) => Err(anyhow!(message)),
        Ok(Err(e)) => Err(e),
        Err(_) => Err(anyhow!("the hub did not answer within 15 s; is adoc-hub installed on the ranch server?")),
    }
}
