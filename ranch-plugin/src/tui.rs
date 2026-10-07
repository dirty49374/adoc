//! The _Hub_Status_Screen_ in the plugin pane, built with the garage49 TUI design system
//! (`garage49-tui-iocraft`), sidebar layout: Waiting, Hosts and Browsers for the hub, Status and
//! Log for this session's client. `a`/`r` decide the waiting browser, `n` names the selected host,
//! `x` revokes the selected browser; `q` (confirmed) and ctrl+c end the client. Without a
//! terminal the client prints its log lines instead.
use crate::client::{Board, Shared};
use crate::proto::{BrowserView, Datagram, HostView, PendingView};
use garage49_tui_iocraft::{
    App, Binding, Column, Content, KeyHint, Label, LabelVariant, ListItem, LogEntry, LogLevel, LogView, Main, MainFocus, Row, Sidebar, StatusSegment, StatusTone, Table, TextField, TypingState, UseKeys, UseStatus,
};
use iocraft::prelude::*;
use std::sync::OnceLock;
use std::time::Duration;
use tokio::sync::mpsc;

/// What the screen shows, copied out of the client's board.
#[derive(Clone, Default, PartialEq)]
pub struct Snapshot {
    pub session: String,
    pub machine: String,
    pub ranch: String,
    pub routing: String,
    pub adoc: String,
    pub hosts: Vec<HostView>,
    pub pending: Vec<PendingView>,
    pub browsers: Vec<BrowserView>,
    pub log: Vec<String>,
}

pub fn snapshot(b: &Board) -> Snapshot {
    Snapshot {
        session: b.session.clone(),
        machine: b.machine.clone(),
        ranch: b.ranch.clone(),
        routing: b.routing.clone(),
        adoc: b.adoc.clone(),
        hosts: b.hosts.clone(),
        pending: b.pending.clone(),
        browsers: b.browsers.clone(),
        log: b.log.iter().cloned().collect(),
    }
}

/// `123456` → `123 456`, easier to compare with the browser at a glance
pub fn spaced(code: &str) -> String { if code.len() == 6 { format!("{} {}", &code[..3], &code[3..]) } else { code.to_string() } }

pub fn short_time(rfc3339: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(rfc3339).map(|t| t.with_timezone(&chrono::Local).format("%m-%d %H:%M").to_string()).unwrap_or_default()
}

/// The code is the check: the person matches it with the browser in front of them; an address would identify nobody.
pub fn pending_rows(s: &Snapshot) -> Vec<Row> {
    s.pending.iter().map(|p| Row::new(&p.code, &[&spaced(&p.code), &short_time(&p.asked_at), &format!("{} s", p.expires_in), &p.user_agent])).collect()
}

pub fn host_rows(s: &Snapshot) -> Vec<Row> {
    s.hosts
        .iter()
        .map(|h| {
            let mine = if h.machine == s.machine { "▪" } else { "" };
            let agent = h.agent.as_ref().map(|a| format!("{} {}", a.name, a.status)).unwrap_or_default();
            Row::new(&h.address, &[mine, &h.address, h.name.as_deref().unwrap_or(""), &h.status, &agent, &h.workspace])
        })
        .collect()
}

pub fn browser_rows(s: &Snapshot) -> Vec<Row> {
    s.browsers.iter().map(|b| Row::new(&b.id, &[&short_time(&b.approved_at), &short_time(&b.last_seen), &b.user_agent])).collect()
}

/// The status page as (label, value) pairs: what ranch's status_command showed, and more.
pub fn status_lines(s: &Snapshot) -> Vec<(String, String)> {
    let mut lines = vec![
        ("Session".into(), format!("{} on {}", s.session, if s.machine.is_empty() { "?" } else { &s.machine })),
        ("Ranch".into(), s.ranch.clone()),
        ("Routing".into(), s.routing.clone()),
        ("adoc program".into(), s.adoc.clone()),
    ];
    let local: Vec<&HostView> = s.hosts.iter().filter(|h| h.machine == s.machine).collect();
    if local.is_empty() {
        lines.push(("adoc servers".into(), "none on this machine".into()));
    }
    for h in local {
        lines.push(("adoc server".into(), format!("{:<11} {}  {}", h.status, h.address, h.workspace)));
    }
    lines
}

/// `HH:MM:SS  text` lines of the board as log entries.
pub fn log_entries(s: &Snapshot) -> Vec<LogEntry> {
    s.log
        .iter()
        .map(|l| {
            let (time, message) = l.split_once("  ").unwrap_or(("", l));
            let level = if message.contains("refused") || message.contains("failed") || message.starts_with("tunnel:") { LogLevel::Warn } else { LogLevel::Info };
            LogEntry { time: time.to_string(), level, message: message.to_string() }
        })
        .collect()
}

/// The selected row id, or the first row's when the selected one is gone.
fn current(selected: &Option<String>, rows: &[Row]) -> Option<String> {
    selected.as_ref().filter(|id| rows.iter().any(|r| &r.id == *id)).cloned().or_else(|| rows.first().map(|r| r.id.clone()))
}

/// The id `delta` rows away from `id`, kept inside the rows.
fn moved(rows: &[Row], id: &Option<String>, delta: i32) -> Option<String> {
    let at = rows.iter().position(|r| Some(&r.id) == id.as_ref()).unwrap_or(0) as i32;
    rows.get((at + delta).clamp(0, rows.len().saturating_sub(1) as i32) as usize).map(|r| r.id.clone())
}

/// The client's side of the screen: its board and where commands go. Set once before the screen runs.
struct Link {
    shared: Shared,
    commands: mpsc::UnboundedSender<Datagram>,
}
static LINK: OnceLock<Link> = OnceLock::new();

fn send(d: Datagram) {
    if let Some(link) = LINK.get() {
        let _ = link.commands.send(d);
    }
}

#[derive(Default, Props)]
struct PageProps {
    snapshot: Snapshot,
}

/// A table page: the cursor moves with ↑↓/jk, extra bindings act on the selected row.
fn table_keys(hooks: &mut Hooks, active: bool, rows: &[Row], selected: State<Option<String>>, mut extra: Vec<Binding>) {
    let id = current(&selected.read(), rows);
    let step = |delta: i32| {
        let (rows, id) = (rows.to_vec(), id.clone());
        move || {
            let mut selected = selected;
            selected.set(moved(&rows, &id, delta));
        }
    };
    extra.push(Binding::new(&["up", "k"], step(-1)));
    extra.push(Binding::new(&["down", "j"], step(1)));
    hooks.use_keys(active, extra, None);
}

#[component]
fn WaitingPage(props: &PageProps, mut hooks: Hooks) -> impl Into<AnyElement<'static>> {
    let active = hooks.use_context::<MainFocus>().0 && !hooks.use_context::<TypingState>().typing();
    let status = hooks.use_status();
    let selected = hooks.use_state(|| None::<String>);
    let rows = pending_rows(&props.snapshot);
    let id = current(&selected.read(), &rows);
    let decide = |approve: bool| {
        let id = id.clone();
        move || {
            if let Some(code) = &id {
                send(Datagram::Decide { code: code.clone(), approve });
                status.report(&format!("{} {}", if approve { "approved" } else { "rejected" }, spaced(code)));
            }
        }
    };
    table_keys(&mut hooks, active, &rows, selected, vec![Binding::new(&["a"], decide(true)), Binding::new(&["r"], decide(false))]);
    let columns = vec![Column::new("Code", 9), Column::new("Asked", 12), Column::new("Left", 6).right(), Column::new("Browser", 60)];
    let pick = move |row: Row| {
        let mut selected = selected;
        selected.set(Some(row.id));
    };
    element! {
        View(flex_direction: FlexDirection::Column) {
            #(if rows.is_empty() {
                element!(Label(content: "No browser is waiting. A browser at the hub's address shows a code; it appears here.", variant: LabelVariant::Muted)).into_any()
            } else {
                element!(Table(columns: columns, rows: rows, selected_id: id, focused: active, on_click: pick, on_select: pick)).into_any()
            })
        }
    }
}

#[component]
fn HostsPage(props: &PageProps, mut hooks: Hooks) -> impl Into<AnyElement<'static>> {
    let focused = hooks.use_context::<MainFocus>().0;
    let typing = hooks.use_context::<TypingState>().typing();
    let status = hooks.use_status();
    let selected = hooks.use_state(|| None::<String>);
    let naming = hooks.use_state(|| None::<String>);
    let rows = host_rows(&props.snapshot);
    let id = current(&selected.read(), &rows);
    let host = props.snapshot.hosts.iter().find(|h| Some(&h.address) == id.as_ref()).cloned();
    let start = {
        let name = host.as_ref().and_then(|h| h.name.clone()).unwrap_or_default();
        move || {
            let mut naming = naming;
            naming.set(Some(name.clone()));
        }
    };
    table_keys(&mut hooks, focused && !typing && naming.read().is_none(), &rows, selected, vec![Binding::new(&["n"], start)]);
    let submit = move || {
        let Some(h) = &host else { return };
        let text = naming.read().clone().unwrap_or_default();
        send(Datagram::Name { machine: Some(h.machine.clone()), workspace: h.workspace.clone(), name: (!text.is_empty()).then_some(text.clone()) });
        status.report(&if text.is_empty() { format!("name of {} removed", h.address) } else { format!("{} named {text}", h.address) });
        let mut naming = naming;
        naming.set(None);
    };
    let cancel = move || {
        let mut naming = naming;
        naming.set(None);
    };
    hooks.use_keys(focused && naming.read().is_some(), vec![Binding::new(&["enter"], submit), Binding::new(&["esc"], cancel)], None);
    let columns = vec![Column::new("", 1), Column::new("Address", 16), Column::new("Name", 12), Column::new("Status", 11), Column::new("Agent", 20), Column::new("Workspace", 40)];
    let pick = move |row: Row| {
        let mut selected = selected;
        selected.set(Some(row.id));
    };
    // The name field stays while the page is shown and takes the keys only while naming, so that its editing state is
    // always given back (a text field removed while editing would leave the app typing).
    let editing = naming.read().clone();
    let shown = editing.clone().unwrap_or_else(|| props.snapshot.hosts.iter().find(|h| Some(&h.address) == id.as_ref()).and_then(|h| h.name.clone()).unwrap_or_default());
    let is_editing = editing.is_some();
    element! {
        View(flex_direction: FlexDirection::Column) {
            #(if rows.is_empty() {
                element!(Label(content: "No adoc host is known yet.", variant: LabelVariant::Muted)).into_any()
            } else {
                element!(Table(columns: columns, rows: rows, selected_id: id, focused: focused && !is_editing, on_click: pick, on_select: pick)).into_any()
            })
            View(margin_top: 1) {
                TextField(label: "Name", value: shown, placeholder: (if is_editing { "lowercase letters, digits, - · empty removes" } else { "n names the selected host" }).to_string(), focused: focused && is_editing,
                    on_change: move |v: String| { let mut naming = naming; naming.set(Some(v.chars().filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '-').collect())) })
            }
        }
    }
}

#[component]
fn BrowsersPage(props: &PageProps, mut hooks: Hooks) -> impl Into<AnyElement<'static>> {
    let active = hooks.use_context::<MainFocus>().0 && !hooks.use_context::<TypingState>().typing();
    let status = hooks.use_status();
    let selected = hooks.use_state(|| None::<String>);
    let rows = browser_rows(&props.snapshot);
    let id = current(&selected.read(), &rows);
    let revoke = {
        let id = id.clone();
        move || {
            if let Some(id) = &id {
                send(Datagram::Revoke { id: id.clone() });
                status.report("browser revoked");
            }
        }
    };
    table_keys(&mut hooks, active, &rows, selected, vec![Binding::new(&["x"], revoke)]);
    let columns = vec![Column::new("Approved", 12), Column::new("Last seen", 12), Column::new("Browser", 70)];
    let pick = move |row: Row| {
        let mut selected = selected;
        selected.set(Some(row.id));
    };
    element! {
        View(flex_direction: FlexDirection::Column) {
            #(if rows.is_empty() {
                element!(Label(content: "No browser is approved.", variant: LabelVariant::Muted)).into_any()
            } else {
                element!(Table(columns: columns, rows: rows, selected_id: id, focused: active, on_click: pick, on_select: pick)).into_any()
            })
        }
    }
}

#[component]
fn StatusPage(props: &PageProps) -> impl Into<AnyElement<'static>> {
    let lines = status_lines(&props.snapshot);
    element! {
        View(flex_direction: FlexDirection::Column) {
            #(lines.into_iter().enumerate().map(|(i, (label, value))| element! {
                View(key: i, flex_direction: FlexDirection::Row, height: 1) {
                    View(width: 14, flex_shrink: 0.0_f32) { Label(content: label, variant: LabelVariant::Muted) }
                    Label(content: value, wrap: TextWrap::NoWrap)
                }
            }))
        }
    }
}

#[component]
fn LogPage(props: &PageProps, mut hooks: Hooks) -> impl Into<AnyElement<'static>> {
    let offset = hooks.use_state(|| 0u32);
    let (_, rows) = hooks.use_terminal_size();
    let entries = log_entries(&props.snapshot);
    element! {
        LogView(entries: entries, offset: offset.get(), rows: rows.saturating_sub(7), on_scroll: move |o: u32| { let mut offset = offset; offset.set(o) })
    }
}

struct Page {
    id: &'static str,
    title: &'static str,
    section: &'static str,
}

const PAGES: [Page; 5] = [
    Page { id: "waiting", title: "Waiting browsers", section: "Hub" },
    Page { id: "hosts", title: "Hosts", section: "Hub" },
    Page { id: "browsers", title: "Approved browsers", section: "Hub" },
    Page { id: "status", title: "This session's client", section: "This session" },
    Page { id: "log", title: "Log", section: "This session" },
];

fn sidebar_items(s: &Snapshot) -> Vec<ListItem> {
    PAGES
        .iter()
        .map(|p| {
            let count = match p.id {
                "waiting" => Some(s.pending.len()),
                "hosts" => Some(s.hosts.len()),
                "browsers" => Some(s.browsers.len()),
                _ => None,
            };
            let label = match p.id {
                "waiting" => "Waiting",
                "hosts" => "Hosts",
                "browsers" => "Browsers",
                "status" => "Status",
                _ => "Log",
            };
            let item = ListItem::new(p.id, label).section(p.section);
            match count {
                Some(n) => item.value(&n.to_string()),
                None => item,
            }
        })
        .collect()
}

fn page_hints(page: &str) -> Vec<KeyHint> {
    match page {
        "waiting" => vec![KeyHint::new("a", "approve"), KeyHint::new("r", "reject")],
        "hosts" => vec![KeyHint::new("n", "name")],
        "browsers" => vec![KeyHint::new("x", "revoke")],
        _ => vec![],
    }
}

fn status_segments(s: &Snapshot) -> Vec<StatusSegment> {
    let ranch = if s.ranch.starts_with("connected") { StatusSegment::new("ranch", StatusTone::Success) } else { StatusSegment::new("ranch disconnected", StatusTone::Warning) };
    let mut out = vec![ranch];
    if !s.pending.is_empty() {
        out.push(StatusSegment::new(&format!("{} waiting", s.pending.len()), StatusTone::Warning));
    }
    out
}

/// The root: App and nothing else (the library's hooks work only in App's children). It polls the board.
#[component]
fn HubScreen(mut hooks: Hooks) -> impl Into<AnyElement<'static>> {
    let page = hooks.use_state(|| "waiting".to_string());
    let snap = hooks.use_state(Snapshot::default);
    hooks.use_future(async move {
        loop {
            if let Some(link) = LINK.get()
                && let Ok(board) = link.shared.board.try_lock()
            {
                let next = snapshot(&board);
                drop(board);
                if *snap.read() != next {
                    let mut snap = snap;
                    snap.set(next);
                }
            }
            smol::Timer::after(Duration::from_millis(250)).await;
        }
    });
    let s = snap.read().clone();
    let page_id = page.read().clone();
    let current = PAGES.iter().find(|p| p.id == page_id).unwrap_or(&PAGES[0]);
    let body = match current.id {
        "hosts" => element!(HostsPage(snapshot: s.clone())).into_any(),
        "browsers" => element!(BrowsersPage(snapshot: s.clone())).into_any(),
        "status" => element!(StatusPage(snapshot: s.clone())).into_any(),
        "log" => element!(LogPage(snapshot: s.clone())).into_any(),
        _ => element!(WaitingPage(snapshot: s.clone())).into_any(),
    };
    let context = format!("adoc-hub {} · {} on {}", crate::product::VERSION, s.session, if s.machine.is_empty() { "?" } else { &s.machine });
    let mut page_state = page;
    element! {
        App(context: context, status: status_segments(&s), hints: page_hints(current.id),
            quit_message: "End the adoc-hub client?".to_string()) {
            Content {
                Sidebar(items: sidebar_items(&s), selected_id: page_id.clone(), on_select: move |item: ListItem| page_state.set(item.id))
                Main(title: current.title.to_string()) { #(std::iter::once(body)) }
            }
        }
    }
}

/// Runs the screen until the person quits (q, ctrl+c); the screen runs on its own thread (smol), the client on tokio.
pub async fn run(shared: Shared, commands: mpsc::UnboundedSender<Datagram>) {
    let _ = LINK.set(Link { shared, commands });
    let _ = tokio::task::spawn_blocking(|| garage49_tui_iocraft::run(element!(HubScreen).into_any(), None)).await;
}

/// Gives the terminal back (raw mode off, main screen, no mouse reporting, cursor shown) before the
/// client re-executes or ends while the screen still runs.
pub fn restore() {
    use crossterm::{cursor::Show, event::DisableMouseCapture, execute, terminal::LeaveAlternateScreen};
    let _ = crossterm::terminal::disable_raw_mode();
    let _ = execute!(std::io::stdout(), DisableMouseCapture, LeaveAlternateScreen, Show);
}

/// The screen only on a real terminal, never when ADOC_HUB_PLAIN is set.
pub fn wanted() -> bool {
    use std::io::IsTerminal;
    std::env::var("ADOC_HUB_PLAIN").is_err() && std::io::stdout().is_terminal()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::AgentView;

    fn snap() -> Snapshot {
        Snapshot {
            session: "ahq".into(),
            machine: "mldev".into(),
            ranch: "connected 12:00:00".into(),
            routing: "this session · tunnel open".into(),
            adoc: "/usr/bin/adoc".into(),
            hosts: vec![
                HostView { address: "mldev_7700".into(), id: None, name: Some("adoc".into()), title: None, machine: "mldev".into(), workspace: "/w/adoc".into(), status: "online".into(), version: None, agent: Some(AgentView { name: "adoc-dev".into(), status: "working".into() }) },
                HostView { address: "segv-mbp_7700".into(), id: None, name: None, title: None, machine: "segv-mbp".into(), workspace: "/w/test".into(), status: "unreachable".into(), version: None, agent: None },
            ],
            pending: vec![PendingView { code: "123456".into(), user_agent: "Firefox".into(), asked_at: "2026-10-03T01:00:00Z".into(), expires_in: 170 }],
            browsers: vec![BrowserView { id: "b1".into(), user_agent: "Chrome".into(), approved_at: "2026-10-03T01:00:00Z".into(), last_seen: "2026-10-03T02:00:00Z".into() }],
            log: vec!["12:00:00  welcome as ranch://mldev/ahq/plugin/adoc-hub/0".into(), "12:00:05  tunnel: closed".into()],
        }
    }

    #[test]
    fn rows_show_the_code_spaced_mark_this_machine_and_keep_no_address() {
        let s = snap();
        let p = pending_rows(&s);
        assert_eq!((p[0].id.as_str(), p[0].cells[0].as_str(), p[0].cells[2].as_str()), ("123456", "123 456", "170 s"));
        let h = host_rows(&s);
        assert_eq!(h[0].cells[0], "▪");
        assert_eq!(h[1].cells[0], "");
        assert_eq!(h[0].cells[4], "adoc-dev working");
        assert_eq!(browser_rows(&s)[0].cells.len(), 3);
    }

    #[test]
    fn status_shows_what_status_command_showed() {
        let s = snap();
        let lines = status_lines(&s);
        assert!(lines.iter().any(|(l, v)| l == "adoc program" && v == "/usr/bin/adoc"));
        assert!(lines.iter().any(|(l, v)| l == "adoc server" && v.contains("mldev_7700")));
        assert!(!lines.iter().any(|(_, v)| v.contains("segv-mbp")), "only this machine's servers");
        let empty = Snapshot { hosts: vec![], ..snap() };
        assert!(status_lines(&empty).iter().any(|(_, v)| v == "none on this machine"));
    }

    #[test]
    fn log_entries_split_time_and_flag_trouble() {
        let e = log_entries(&snap());
        assert_eq!(e[0].time, "12:00:00");
        assert!(matches!(e[0].level, LogLevel::Info));
        assert!(matches!(e[1].level, LogLevel::Warn));
    }

    #[test]
    fn selection_follows_rows() {
        let rows = vec![Row::new("a", &["a"]), Row::new("b", &["b"])];
        assert_eq!(current(&None, &rows).as_deref(), Some("a"));
        assert_eq!(current(&Some("gone".into()), &rows).as_deref(), Some("a"));
        assert_eq!(moved(&rows, &Some("a".into()), 1).as_deref(), Some("b"));
        assert_eq!(moved(&rows, &Some("b".into()), 1).as_deref(), Some("b"), "kept inside");
        assert_eq!(moved(&rows, &Some("a".into()), -1).as_deref(), Some("a"));
        let counts = sidebar_items(&snap());
        assert_eq!(counts.iter().map(|i| i.value.clone()).collect::<Vec<_>>(), vec![Some("1".into()), Some("2".into()), Some("1".into()), None, None]);
    }
}
