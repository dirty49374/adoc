//! The _Hub_Status_Screen_ in the plugin pane, built with the garage49 TUI design system
//! (`garage49-tui-iocraft`), sidebar layout: Waiting, Hosts and Browsers for the hub, Status and
//! Log for this session's client. `a`/`r` decide the waiting browser, `n` names the selected host,
//! `x` revokes the selected browser; `q` (confirmed) and ctrl+c end the client. Without a
//! terminal the client prints its log lines instead.
use crate::client::{Board, Shared};
use crate::proto::{BrowserView, Datagram, HostView, PendingView};
use garage49_tui_iocraft::{
    App, Binding, Column, Content, Form, Intro, KeyHint, Label, LabelVariant, List, ListItem, LogEntry, LogLevel, LogView, Main, MainFocus, Row, Section, Sidebar, StatusSegment, StatusTone, Table, TextField, TypingState, UseKeys, UseStatus,
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

/// The status page's client facts as (label, value): with the adoc program and the machine's servers (below), what ranch's
/// status_command showed, and more.
pub fn status_lines(s: &Snapshot) -> Vec<(String, String)> {
    vec![
        ("Session".into(), format!("{} on {}", s.session, if s.machine.is_empty() { "?" } else { &s.machine })),
        ("Ranch".into(), s.ranch.clone()),
        ("Routing".into(), s.routing.clone()),
    ]
}

/// The adoc servers of this machine, as the hub knows them.
pub fn local_rows(s: &Snapshot) -> Vec<Row> {
    s.hosts.iter().filter(|h| h.machine == s.machine).map(|h| Row::new(&h.address, &[&h.status, &h.address, &h.workspace])).collect()
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

/// What the person chose on the screen, kept by the root so that a key on a page and a click on its key hint run the
/// same action: the selected row of each table, the name being typed, and the last message for the status line.
#[derive(Clone, Default, PartialEq)]
struct Ui {
    waiting: Option<String>,
    hosts: Option<String>,
    browsers: Option<String>,
    naming: Option<String>,
    message: Option<(u64, String)>,
}

fn update(ui: State<Ui>, f: impl FnOnce(&mut Ui)) {
    let mut next = ui.read().clone();
    f(&mut next);
    let mut ui = ui;
    ui.set(next);
}

fn report(ui: State<Ui>, text: String) { update(ui, |u| u.message = Some((u.message.as_ref().map_or(0, |m| m.0) + 1, text))); }

/// The actions of the pages, for keys and key hints alike.
mod act {
    use super::*;

    pub fn decide(ui: State<Ui>, s: &Snapshot, approve: bool) {
        let Some(code) = current(&ui.read().waiting, &pending_rows(s)) else { return };
        send(Datagram::Decide { code: code.clone(), approve });
        report(ui, format!("{} {}", if approve { "approved" } else { "rejected" }, spaced(&code)));
    }

    pub fn revoke(ui: State<Ui>, s: &Snapshot) {
        let Some(id) = current(&ui.read().browsers, &browser_rows(s)) else { return };
        send(Datagram::Revoke { id });
        report(ui, "browser revoked".into());
    }

    fn selected_host(ui: State<Ui>, s: &Snapshot) -> Option<HostView> {
        let id = current(&ui.read().hosts, &host_rows(s))?;
        s.hosts.iter().find(|h| h.address == id).cloned()
    }

    pub fn start_naming(ui: State<Ui>, s: &Snapshot) {
        let Some(h) = selected_host(ui, s) else { return };
        update(ui, |u| u.naming = Some(h.name.unwrap_or_default()));
    }

    pub fn submit_name(ui: State<Ui>, s: &Snapshot) {
        let Some(h) = selected_host(ui, s) else { return };
        let text = ui.read().naming.clone().unwrap_or_default();
        send(Datagram::Name { machine: Some(h.machine.clone()), workspace: h.workspace.clone(), name: (!text.is_empty()).then_some(text.clone()) });
        update(ui, |u| u.naming = None);
        report(ui, if text.is_empty() { format!("name of {} removed", h.address) } else { format!("{} named {text}", h.address) });
    }

    pub fn cancel_name(ui: State<Ui>) { update(ui, |u| u.naming = None); }

    /// Moves the selection of a table by `delta` rows.
    pub fn step(ui: State<Ui>, rows: &[Row], pick: fn(&mut Ui) -> &mut Option<String>, delta: i32) {
        let mut probe = ui.read().clone();
        let id = current(pick(&mut probe), rows);
        let next = moved(rows, &id, delta);
        update(ui, |u| *pick(u) = next);
    }
}

#[derive(Default, Props)]
struct PageProps {
    snapshot: Snapshot,
    ui: Option<State<Ui>>,
}

/// ↑↓/jk move the table's cursor; `extra` act on the selected row.
fn table_keys(hooks: &mut Hooks, active: bool, ui: State<Ui>, rows: Vec<Row>, pick: fn(&mut Ui) -> &mut Option<String>, mut extra: Vec<Binding>) {
    let (up, down) = (rows.clone(), rows);
    extra.push(Binding::new(&["up", "k"], move || act::step(ui, &up, pick, -1)));
    extra.push(Binding::new(&["down", "j"], move || act::step(ui, &down, pick, 1)));
    hooks.use_keys(active, extra, None);
}

fn select_on(ui: State<Ui>, pick: fn(&mut Ui) -> &mut Option<String>) -> impl FnMut(Row) + Send + Sync + 'static { move |row: Row| update(ui, |u| *pick(u) = Some(row.id)) }

fn waiting_of(u: &mut Ui) -> &mut Option<String> { &mut u.waiting }
fn hosts_of(u: &mut Ui) -> &mut Option<String> { &mut u.hosts }
fn browsers_of(u: &mut Ui) -> &mut Option<String> { &mut u.browsers }

#[component]
fn WaitingPage(props: &PageProps, mut hooks: Hooks) -> impl Into<AnyElement<'static>> {
    let Some(ui) = props.ui else { return element!(View).into_any() };
    let active = hooks.use_context::<MainFocus>().0 && !hooks.use_context::<TypingState>().typing();
    let rows = pending_rows(&props.snapshot);
    let id = current(&ui.read().waiting, &rows);
    let (s1, s2) = (props.snapshot.clone(), props.snapshot.clone());
    table_keys(&mut hooks, active, ui, rows.clone(), waiting_of, vec![Binding::new(&["a"], move || act::decide(ui, &s1, true)), Binding::new(&["r"], move || act::decide(ui, &s2, false))]);
    let columns = vec![Column::new("Code", 9), Column::new("Asked", 12), Column::new("Left", 6).right(), Column::new("Browser", 60)];
    element! {
        View(flex_direction: FlexDirection::Column, flex_grow: 1.0_f32) {
            Intro(title: "A browser at the hub's address shows a code".to_string()) {
                Label(content: "Check the code against the browser in front of you, then approve or reject it here; the first answer in any session decides.", variant: LabelVariant::Muted)
            }
            Section(title: "Waiting".to_string(), grow: true) {
                #(if rows.is_empty() {
                    element!(Label(content: "No browser is waiting.", variant: LabelVariant::Muted)).into_any()
                } else {
                    element!(Table(columns: columns, rows: rows, selected_id: id, focused: active, on_click: select_on(ui, waiting_of), on_select: select_on(ui, waiting_of))).into_any()
                })
            }
        }
    }
    .into_any()
}

#[component]
fn HostsPage(props: &PageProps, mut hooks: Hooks) -> impl Into<AnyElement<'static>> {
    let Some(ui) = props.ui else { return element!(View).into_any() };
    let focused = hooks.use_context::<MainFocus>().0;
    let typing = hooks.use_context::<TypingState>().typing();
    let rows = host_rows(&props.snapshot);
    let id = current(&ui.read().hosts, &rows);
    let editing = ui.read().naming.clone();
    let is_editing = editing.is_some();
    let (s1, s2) = (props.snapshot.clone(), props.snapshot.clone());
    table_keys(&mut hooks, focused && !typing && !is_editing, ui, rows.clone(), hosts_of, vec![Binding::new(&["n"], move || act::start_naming(ui, &s1))]);
    hooks.use_keys(focused && is_editing, vec![Binding::new(&["enter"], move || act::submit_name(ui, &s2)), Binding::new(&["esc"], move || act::cancel_name(ui))], None);
    let columns = vec![Column::new("", 1), Column::new("Address", 16), Column::new("Name", 12), Column::new("Status", 11), Column::new("Agent", 20), Column::new("Workspace", 40)];
    // The name field stays while the page is shown and takes the keys only while naming.
    let shown = editing.unwrap_or_else(|| props.snapshot.hosts.iter().find(|h| Some(&h.address) == id.as_ref()).and_then(|h| h.name.clone()).unwrap_or_default());
    element! {
        View(flex_direction: FlexDirection::Column, flex_grow: 1.0_f32) {
            Section(title: "Hosts".to_string()) {
                #(if rows.is_empty() {
                    element!(Label(content: "No adoc host is known yet.", variant: LabelVariant::Muted)).into_any()
                } else {
                    element!(Table(columns: columns, rows: rows, selected_id: id, focused: focused && !is_editing, on_click: select_on(ui, hosts_of), on_select: select_on(ui, hosts_of))).into_any()
                })
            }
            Section(title: "Name of the selected host".to_string()) {
                Label(content: "The host answers at its name and at its machine_port address.", variant: LabelVariant::Muted)
                Form {
                    TextField(label: "Name", value: shown, placeholder: (if is_editing { "lowercase letters, digits, - · empty removes" } else { "n names the selected host" }).to_string(), focused: focused && is_editing,
                        on_change: move |v: String| update(ui, |u| u.naming = Some(v.chars().filter(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || *c == '-').collect())))
                }
            }
        }
    }
    .into_any()
}

#[component]
fn BrowsersPage(props: &PageProps, mut hooks: Hooks) -> impl Into<AnyElement<'static>> {
    let Some(ui) = props.ui else { return element!(View).into_any() };
    let active = hooks.use_context::<MainFocus>().0 && !hooks.use_context::<TypingState>().typing();
    let rows = browser_rows(&props.snapshot);
    let id = current(&ui.read().browsers, &rows);
    let s1 = props.snapshot.clone();
    table_keys(&mut hooks, active, ui, rows.clone(), browsers_of, vec![Binding::new(&["x"], move || act::revoke(ui, &s1))]);
    let columns = vec![Column::new("Approved", 12), Column::new("Last seen", 12), Column::new("Browser", 70)];
    element! {
        View(flex_direction: FlexDirection::Column, flex_grow: 1.0_f32) {
            Section(title: "Approved browsers".to_string(), grow: true) {
                Label(content: "An approval never expires; revoking one refuses its cookie and closes its open connections at once.", variant: LabelVariant::Muted)
                #(if rows.is_empty() {
                    element!(Label(content: "No browser is approved.", variant: LabelVariant::Muted)).into_any()
                } else {
                    element!(Table(columns: columns, rows: rows, selected_id: id, focused: active, on_click: select_on(ui, browsers_of), on_select: select_on(ui, browsers_of))).into_any()
                })
            }
        }
    }
    .into_any()
}

#[component]
fn StatusPage(props: &PageProps) -> impl Into<AnyElement<'static>> {
    let items: Vec<ListItem> = status_lines(&props.snapshot).into_iter().map(|(label, value)| ListItem::new(&label, &label).value(&value)).collect();
    let servers = local_rows(&props.snapshot);
    let columns = vec![Column::new("Status", 11), Column::new("Address", 16), Column::new("Workspace", 50)];
    element! {
        View(flex_direction: FlexDirection::Column, flex_grow: 1.0_f32) {
            Section(title: "This session's client".to_string()) { List(items: items, focused: false) }
            Section(title: "adoc program".to_string()) {
                Label(content: "Found through ADOC_BIN, then PATH, then the login shell; runs adoc server list every 3 s while this session routes its machine.", variant: LabelVariant::Muted)
                Label(content: props.snapshot.adoc.clone())
            }
            Section(title: "adoc servers of this machine".to_string()) {
                #(if servers.is_empty() {
                    element!(Label(content: "None known.", variant: LabelVariant::Muted)).into_any()
                } else {
                    element!(Table(columns: columns, rows: servers, focused: false)).into_any()
                })
            }
        }
    }
}

#[component]
fn LogPage(props: &PageProps, mut hooks: Hooks) -> impl Into<AnyElement<'static>> {
    let offset = hooks.use_state(|| 0u32);
    let (_, rows) = hooks.use_terminal_size();
    let entries = log_entries(&props.snapshot);
    element! {
        View(flex_direction: FlexDirection::Column, flex_grow: 1.0_f32) {
            Section(title: "Log".to_string(), grow: true) {
                LogView(entries: entries, offset: offset.get(), rows: rows.saturating_sub(11), on_scroll: move |o: u32| { let mut offset = offset; offset.set(o) })
            }
        }
    }
}

/// Puts the screen's last message on the status line (inside App, where the status hook works).
#[derive(Default, Props)]
struct ReporterProps {
    message: Option<(u64, String)>,
}

#[component]
fn Reporter(props: &ReporterProps, mut hooks: Hooks) -> impl Into<AnyElement<'static>> {
    let status = hooks.use_status();
    let shown = hooks.use_state(|| 0u64);
    if let Some((n, text)) = &props.message
        && *n != shown.get()
    {
        status.report(text);
        let mut shown = shown;
        shown.set(*n);
    }
    element!(View)
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

/// The page's keys as clickable hints: a click runs the same action as the key.
fn page_hints(page: &str, ui: State<Ui>, s: &Snapshot) -> Vec<KeyHint> {
    let (s1, s2) = (s.clone(), s.clone());
    match page {
        "waiting" => vec![KeyHint::new("a", "approve").with_action(move || act::decide(ui, &s1, true)), KeyHint::new("r", "reject").with_action(move || act::decide(ui, &s2, false))],
        "hosts" if ui.read().naming.is_some() => vec![KeyHint::new("enter", "set name").with_action(move || act::submit_name(ui, &s1)), KeyHint::new("esc", "cancel").with_action(move || act::cancel_name(ui))],
        "hosts" => vec![KeyHint::new("n", "name").with_action(move || act::start_naming(ui, &s1))],
        "browsers" => vec![KeyHint::new("x", "revoke").with_action(move || act::revoke(ui, &s1))],
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

/// The root: App and nothing else (the library's hooks work only in App's children). It polls the board and keeps the
/// screen's choices.
#[component]
fn HubScreen(mut hooks: Hooks) -> impl Into<AnyElement<'static>> {
    let page = hooks.use_state(|| "waiting".to_string());
    let snap = hooks.use_state(Snapshot::default);
    let ui = hooks.use_state(Ui::default);
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
        "hosts" => element!(HostsPage(snapshot: s.clone(), ui: Some(ui))).into_any(),
        "browsers" => element!(BrowsersPage(snapshot: s.clone(), ui: Some(ui))).into_any(),
        "status" => element!(StatusPage(snapshot: s.clone())).into_any(),
        "log" => element!(LogPage(snapshot: s.clone())).into_any(),
        _ => element!(WaitingPage(snapshot: s.clone(), ui: Some(ui))).into_any(),
    };
    let context = format!("adoc-hub {} · {} on {}", crate::product::VERSION, s.session, if s.machine.is_empty() { "?" } else { &s.machine });
    let message = ui.read().message.clone();
    let mut page_state = page;
    element! {
        App(context: context, status: status_segments(&s), hints: page_hints(current.id, ui, &s), quit_message: "End the adoc-hub client?".to_string()) {
            Content {
                Sidebar(items: sidebar_items(&s), selected_id: page_id.clone(), on_select: move |item: ListItem| page_state.set(item.id))
                Main(title: current.title.to_string()) {
                    Reporter(message: message)
                    #(std::iter::once(body))
                }
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
        assert!(status_lines(&s).iter().any(|(l, v)| l == "Routing" && v.contains("tunnel open")));
        let local = local_rows(&s);
        assert_eq!(local.len(), 1, "only this machine's servers");
        assert_eq!(local[0].cells, vec!["online", "mldev_7700", "/w/adoc"]);
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
