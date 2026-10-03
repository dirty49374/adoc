//! The _Hub_Status_Screen_ in the plugin pane: the browsers waiting for approval, the hosts, the
//! approved browsers and a short log. Single keys decide approvals and revoke browsers; `n` names
//! a host. Ctrl-C ends the client. Without a terminal the client prints its log lines instead.
use crate::client::Shared;
use crate::proto::{BrowserView, Datagram, HostView, PendingView};
use crossterm::event::{Event, EventStream, KeyCode, KeyEventKind, KeyModifiers};
use futures_util::StreamExt;
use ratatui::layout::{Constraint, Layout};
use ratatui::style::{Color, Modifier, Style};
use ratatui::text::{Line, Span};
use ratatui::widgets::{Block, Borders, Cell, Paragraph, Row, Table};
use tokio::sync::mpsc;

#[derive(Clone, Copy, PartialEq, Eq, Debug)]
pub enum Focus {
    Waiting,
    Hosts,
    Browsers,
}

/// The screen's own state: which list has the focus, the selection in each, the name being typed.
#[derive(Debug)]
pub struct Ui {
    pub focus: Focus,
    pub selected: [usize; 3],
    pub input: Option<String>,
}

/// A frame's worth of data, copied out from under the lock.
pub struct View {
    pub header: String,
    pub ranch: String,
    pub routing: String,
    pub adoc: String,
    pub machine: String,
    pub hosts: Vec<HostView>,
    pub pending: Vec<PendingView>,
    pub browsers: Vec<BrowserView>,
    pub log: Vec<String>,
}

fn index(f: Focus) -> usize { f as usize }

fn status_style(s: &str) -> Style {
    match s {
        "online" | "idle" | "done" => Style::default().fg(Color::Green),
        "working" => Style::default().fg(Color::Yellow),
        "blocked" | "unreachable" => Style::default().fg(Color::Red),
        _ => Style::default().fg(Color::DarkGray),
    }
}

fn short_time(rfc3339: &str) -> String {
    chrono::DateTime::parse_from_rfc3339(rfc3339).map(|t| t.with_timezone(&chrono::Local).format("%m-%d %H:%M").to_string()).unwrap_or_default()
}

fn block(title: String, focused: bool) -> Block<'static> {
    let style = if focused { Style::default().fg(Color::Cyan).add_modifier(Modifier::BOLD) } else { Style::default() };
    Block::default().borders(Borders::TOP).title(Span::styled(title, style))
}

fn row_style(focused: bool, selected: bool) -> Style { if focused && selected { Style::default().add_modifier(Modifier::REVERSED) } else { Style::default() } }

pub fn draw(f: &mut ratatui::Frame, v: &View, ui: &Ui) {
    let area = f.area();
    let waiting_h = if v.pending.is_empty() { 2 } else { v.pending.len() as u16 + 2 };
    let hosts_h = (v.hosts.len() as u16 + 2).max(3);
    let browsers_h = (v.browsers.len() as u16 + 2).max(3);
    let chunks = Layout::vertical([Constraint::Length(2), Constraint::Length(waiting_h), Constraint::Length(hosts_h), Constraint::Length(browsers_h), Constraint::Min(2), Constraint::Length(1)]).split(area);

    let ranch_style = if v.ranch.starts_with("connected") { Style::default().fg(Color::Green) } else { Style::default().fg(Color::Red) };
    let header = vec![
        Line::from(vec![Span::styled(v.header.clone(), Style::default().add_modifier(Modifier::BOLD)), Span::raw(" · "), Span::styled(v.ranch.clone(), ranch_style), Span::raw(format!(" · routing: {}", v.routing))]),
        Line::from(Span::styled(format!(" adoc: {}", v.adoc), Style::default().fg(Color::DarkGray))),
    ];
    f.render_widget(Paragraph::new(header), chunks[0]);

    let focused = ui.focus == Focus::Waiting;
    if v.pending.is_empty() {
        f.render_widget(Paragraph::new(Span::styled(" no browser is waiting", Style::default().fg(Color::DarkGray))).block(block(" waiting browsers ".into(), focused)), chunks[1]);
    } else {
        let rows: Vec<Row> = v.pending.iter().enumerate().map(|(i, p)| Row::new(vec![Cell::from(Span::styled(p.code.clone(), Style::default().fg(Color::Yellow).add_modifier(Modifier::BOLD))), Cell::from(p.address.clone()), Cell::from(format!("{} s", p.expires_in)), Cell::from(p.user_agent.clone())]).style(row_style(focused, i == ui.selected[0]))).collect();
        let t = Table::new(rows, [Constraint::Length(8), Constraint::Length(16), Constraint::Length(6), Constraint::Min(10)]).block(block(format!(" waiting browsers ({}) · a approve · r reject ", v.pending.len()), focused));
        f.render_widget(t, chunks[1]);
    }

    let focused = ui.focus == Focus::Hosts;
    let head = Row::new(vec!["", "ADDRESS", "NAME", "STATUS", "AGENT", "WORKSPACE"]).style(Style::default().add_modifier(Modifier::UNDERLINED));
    let rows: Vec<Row> = v
        .hosts
        .iter()
        .enumerate()
        .map(|(i, h)| {
            let agent = h.agent.as_ref().map(|a| format!("{} {}", a.name, a.status)).unwrap_or_default();
            Row::new(vec![
                Cell::from(if h.machine == v.machine { "●" } else { "" }),
                Cell::from(h.address.clone()),
                Cell::from(h.name.clone().unwrap_or_default()),
                Cell::from(Span::styled(h.status.clone(), status_style(&h.status))),
                Cell::from(Span::styled(agent, h.agent.as_ref().map(|a| status_style(&a.status)).unwrap_or_default())),
                Cell::from(h.workspace.clone()).style(Style::default().fg(Color::DarkGray)),
            ])
            .style(row_style(focused, i == ui.selected[1]))
        })
        .collect();
    let t = Table::new(rows, [Constraint::Length(1), Constraint::Length(18), Constraint::Length(14), Constraint::Length(11), Constraint::Length(24), Constraint::Min(10)]).header(head).block(block(format!(" hosts ({}) · ● this machine · n name ", v.hosts.len()), focused));
    f.render_widget(t, chunks[2]);

    let focused = ui.focus == Focus::Browsers;
    let head = Row::new(vec!["ADDRESS", "APPROVED", "LAST SEEN", "BROWSER"]).style(Style::default().add_modifier(Modifier::UNDERLINED));
    let rows: Vec<Row> = v.browsers.iter().enumerate().map(|(i, b)| Row::new(vec![Cell::from(b.address.clone()), Cell::from(short_time(&b.approved_at)), Cell::from(short_time(&b.last_seen)), Cell::from(b.user_agent.clone()).style(Style::default().fg(Color::DarkGray))]).style(row_style(focused, i == ui.selected[2]))).collect();
    let t = Table::new(rows, [Constraint::Length(16), Constraint::Length(12), Constraint::Length(12), Constraint::Min(10)]).header(head).block(block(format!(" approved browsers ({}) · x revoke ", v.browsers.len()), focused));
    f.render_widget(t, chunks[3]);

    let h = chunks[4].height.saturating_sub(1) as usize;
    let lines: Vec<Line> = v.log.iter().skip(v.log.len().saturating_sub(h)).map(|l| Line::from(l.clone())).collect();
    f.render_widget(Paragraph::new(lines).block(Block::default().borders(Borders::TOP).title(" log ")), chunks[4]);

    let footer = match &ui.input {
        Some(text) => Line::from(vec![Span::styled(" name: ", Style::default().fg(Color::Cyan)), Span::raw(text.clone()), Span::styled("▏ Enter set (empty removes) · Esc cancel", Style::default().fg(Color::DarkGray))]),
        None => Line::from(Span::styled(" Tab list · ↑/↓ select · a approve · r reject · n name · x revoke · Ctrl-C ends the client", Style::default().fg(Color::DarkGray))),
    };
    f.render_widget(Paragraph::new(footer), chunks[5]);
}

async fn view(shared: &Shared) -> View {
    let b = shared.board.lock().await;
    View {
        header: format!(" adoc-hub {} · {} on {}", crate::product::VERSION, b.session, if b.machine.is_empty() { "?" } else { &b.machine }),
        ranch: b.ranch.clone(),
        routing: b.routing.clone(),
        adoc: b.adoc.clone(),
        machine: b.machine.clone(),
        hosts: b.hosts.clone(),
        pending: b.pending.clone(),
        browsers: b.browsers.clone(),
        log: b.log.iter().cloned().collect(),
    }
}

/// What a key does to the screen, and the datagram it sends, if any.
pub fn key(ui: &mut Ui, v: &View, code: KeyCode) -> Option<Datagram> {
    if let Some(text) = ui.input.as_mut() {
        match code {
            KeyCode::Char(c) if c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-' => text.push(c),
            KeyCode::Backspace => {
                text.pop();
            }
            KeyCode::Esc => ui.input = None,
            KeyCode::Enter => {
                let text = ui.input.take().unwrap_or_default();
                let h = v.hosts.get(ui.selected[1])?;
                return Some(Datagram::Name { machine: Some(h.machine.clone()), workspace: h.workspace.clone(), name: (!text.is_empty()).then_some(text) });
            }
            _ => {}
        }
        return None;
    }
    let len = |f: Focus| match f {
        Focus::Waiting => v.pending.len(),
        Focus::Hosts => v.hosts.len(),
        Focus::Browsers => v.browsers.len(),
    };
    let i = index(ui.focus);
    match code {
        KeyCode::Tab => {
            ui.focus = match ui.focus {
                Focus::Waiting => Focus::Hosts,
                Focus::Hosts => Focus::Browsers,
                Focus::Browsers => Focus::Waiting,
            }
        }
        KeyCode::Up => ui.selected[i] = ui.selected[i].saturating_sub(1),
        KeyCode::Down => ui.selected[i] = (ui.selected[i] + 1).min(len(ui.focus).saturating_sub(1)),
        // approvals take the selected waiting browser, or the only one, from any list
        KeyCode::Char(c @ ('a' | 'r')) => {
            let p = if v.pending.len() == 1 { v.pending.first() } else if ui.focus == Focus::Waiting { v.pending.get(ui.selected[0]) } else { None }?;
            return Some(Datagram::Decide { code: p.code.clone(), approve: c == 'a' });
        }
        KeyCode::Char('n') if ui.focus == Focus::Hosts => {
            let h = v.hosts.get(ui.selected[1])?;
            ui.input = Some(h.name.clone().unwrap_or_default());
        }
        KeyCode::Char('x') if ui.focus == Focus::Browsers => {
            let b = v.browsers.get(ui.selected[2])?;
            return Some(Datagram::Revoke { id: b.id.clone() });
        }
        _ => {}
    }
    None
}

/// Redraws on changes, every second and on resize; returns on Ctrl-C, which ends the client.
pub async fn run(shared: Shared, commands: mpsc::UnboundedSender<Datagram>) {
    let mut term = ratatui::init();
    let mut keys = EventStream::new();
    let mut tick = tokio::time::interval(std::time::Duration::from_secs(1));
    let mut ui = Ui { focus: Focus::Waiting, selected: [0; 3], input: None };
    loop {
        let v = view(&shared).await;
        for f in [Focus::Waiting, Focus::Hosts, Focus::Browsers] {
            let n = match f {
                Focus::Waiting => v.pending.len(),
                Focus::Hosts => v.hosts.len(),
                Focus::Browsers => v.browsers.len(),
            };
            ui.selected[index(f)] = ui.selected[index(f)].min(n.saturating_sub(1));
        }
        let _ = term.draw(|f| draw(f, &v, &ui));
        tokio::select! {
            _ = shared.redraw.notified() => {}
            _ = tick.tick() => {}
            ev = keys.next() => {
                if let Some(Ok(Event::Key(k))) = ev {
                    if k.kind != KeyEventKind::Press { continue; }
                    if k.code == KeyCode::Char('c') && k.modifiers.contains(KeyModifiers::CONTROL) { return; }
                    if let Some(d) = key(&mut ui, &v, k.code) {
                        let _ = commands.send(d);
                    }
                }
            }
        }
    }
}

pub fn restore() { ratatui::restore(); }

/// The screen only on a real terminal, never when ADOC_HUB_PLAIN is set.
pub fn wanted() -> bool {
    use std::io::IsTerminal;
    std::env::var("ADOC_HUB_PLAIN").is_err() && std::io::stdout().is_terminal()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::proto::AgentView;

    fn view() -> View {
        View {
            header: " adoc-hub 0.1.0 · ahq on mldev".into(),
            ranch: "connected 12:00:00".into(),
            routing: "this session · tunnel open".into(),
            adoc: "/usr/bin/adoc".into(),
            machine: "mldev".into(),
            hosts: (0..3).map(|i| HostView { address: format!("mldev_77{i:02}"), id: None, name: (i == 1).then(|| "demo".into()), title: None, machine: "mldev".into(), workspace: format!("/w/{i}"), status: "online".into(), version: None, agent: Some(AgentView { name: "a".into(), status: "idle".into() }) }).collect(),
            pending: vec![PendingView { code: "123456".into(), address: "192.168.1.20".into(), user_agent: "Firefox".into(), expires_in: 170 }],
            browsers: vec![BrowserView { id: "b1".into(), address: "192.168.1.21".into(), user_agent: "Chrome".into(), approved_at: "2026-10-03T01:00:00Z".into(), last_seen: "2026-10-03T02:00:00Z".into() }],
            log: (0..30).map(|i| format!("12:00:{i:02}  line")).collect(),
        }
    }

    #[test]
    fn keys_decide_name_and_revoke() {
        let v = view();
        let mut ui = Ui { focus: Focus::Hosts, selected: [0; 3], input: None };
        assert_eq!(key(&mut ui, &v, KeyCode::Char('a')), Some(Datagram::Decide { code: "123456".into(), approve: true }), "the only waiting browser, from any list");
        key(&mut ui, &v, KeyCode::Down);
        assert_eq!(key(&mut ui, &v, KeyCode::Char('n')), None);
        assert_eq!(ui.input.as_deref(), Some("demo"));
        for _ in 0..4 {
            key(&mut ui, &v, KeyCode::Backspace);
        }
        for c in "web-1".chars() {
            key(&mut ui, &v, KeyCode::Char(c));
        }
        key(&mut ui, &v, KeyCode::Char('X'));
        assert_eq!(key(&mut ui, &v, KeyCode::Enter), Some(Datagram::Name { machine: Some("mldev".into()), workspace: "/w/1".into(), name: Some("web-1".into()) }));
        key(&mut ui, &v, KeyCode::Tab);
        assert_eq!(ui.focus, Focus::Browsers);
        assert_eq!(key(&mut ui, &v, KeyCode::Char('x')), Some(Datagram::Revoke { id: "b1".into() }));
    }

    #[test]
    fn draw_fits_small_and_large_terminals() {
        let v = view();
        let ui = Ui { focus: Focus::Waiting, selected: [0; 3], input: Some("de".into()) };
        for (w, h) in [(80, 24), (40, 10), (200, 60), (20, 5)] {
            let mut t = ratatui::Terminal::new(ratatui::backend::TestBackend::new(w, h)).unwrap();
            t.draw(|f| draw(f, &v, &ui)).unwrap();
            if h >= 24 {
                let s = format!("{:?}", t.backend().buffer());
                assert!(s.contains("123456") && s.contains("hosts (3)") && s.contains("approved browsers (1)"));
            }
        }
    }
}
