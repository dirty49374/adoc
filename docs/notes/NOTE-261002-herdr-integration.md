---
title: herdr integration as the default
status: OPEN
---

## Background

The person wants herdr to be the default way adoc talks to the agent. With the herdr integration on, the right panel of the web UI becomes the agent's terminal, rendered live. The agent tells adoc which herdr pane is the assigned agent (and can take the role over) with an adoc command, or when the server starts.

## Findings

- **herdr has a built-in live stream (verified on this machine, herdr 0.9.1).** `herdr terminal session observe <pane_id|terminal_id> --cols C --rows R` prints NDJSON: `{"type":"terminal.frame","seq":1,"full":true,"width":117,"height":71,"encoding":"ansi","bytes":"<base64>"}`, a full frame first, then `full:false` diffs that include the cursor position. Several observers may watch at once; observing did not resize the pane. Without `--cols/--rows` it renders at 120x40.
- **Read-write variant (documented, not yet run here):** `herdr terminal session control <target> [--takeover]` streams the same frames and reads `terminal.input` (text or base64 bytes), `terminal.resize`, `terminal.scroll`, `terminal.release` on stdin. One controller at a time.
- **Socket API:** NDJSON over the session socket `$HERDR_SOCKET_PATH` (here `~/.config/herdr/sessions/ahq-dev/herdr.sock`; one socket per herdr session). Useful methods: `ping`, `session.snapshot`, `pane.get` (pane_id, terminal_id, agent, agent_status, agent_session), `pane.read {format:"ansi"}` (snapshot without cursor), `pane.send_text`, `pane.send_keys`, `pane.send_input`, `agent.prompt` (text plus Enter, bracketed paste), `events.subscribe` (`pane.agent_status_changed`, `pane.updated`, `pane.closed`, …). There is no raw-output event; output comes only from observe/control/read.
- **Existing web UIs:** [devswha/herdr-web-ui](https://github.com/devswha/herdr-web-ui) (MIT, Bun + React + xterm.js; PTY `herdr terminal attach` per pane via node-pty, polling `pane.read` fallback, WebSocket protocol with ACK flow control), narumiruna/herdr-web (AGPL, built on session control/observe), kcosr/herdr-web (MIT, Rust bridge), and several node-pty-runs-the-TUI variants. `@brooswit/herdr-sdk` is a typed TypeScript socket client generated from herdr's schema.
- **herdr plugins** (`herdr-plugin.toml` with `[[startup]]`, `[[panes]]`, `[[actions]]`, `[[events]]`) are herdr's extension point; local examples: `~/work/herdr-glasses`, `~/work/herdr-ranch`.

## Ideas

- **Mirror:** the adoc server spawns `herdr terminal session observe <agent pane> --cols W --rows H` at the pane's own size and forwards the decoded frames over the existing WebSocket; the web UI renders them with xterm.js in the right panel. No node-pty, no herdr TUI in the browser.
- **Input:** typing in the mirrored terminal goes to the pane through `pane.send_input` (or a `session control` child without `--takeover`, after testing). Drafts and the composer still exist and are sent with `agent.prompt` in the adoc message format, so structured comments keep working next to free typing.
- **Claiming the role:** `adoc agent claim` run by the agent inside its pane reads `HERDR_SOCKET_PATH` and its own pane from the environment, and makes that pane the assigned agent; the previous holder loses the role. `adoc server run --agent-pane <pane>` does the same at start.
- **Status:** one `events.subscribe` connection shows the agent's state (working, idle, done) and notices when the pane closes.
- **Fallback:** without herdr (or when the pane is gone), the right panel shows the message dock as today and the wait transport stays available.
- **Naming:** follow herdr's terms: observe (read-only), control (read-write), pane, terminal. Avoid "mirror" for the live stream.

## Open questions

- Where does the claim live: in server memory only (lost on restart, re-claimed by the agent), or written into `.adoc/adoc.yaml`?
- Typing into the terminal: allow full keyboard control from the browser, or keep the browser read-only plus the composer?
- Should the right panel show only the terminal, or the terminal with the draft list and pending messages around it?
- Terminal size: render at the pane's size and scale in the browser, or resize the pane to the browser (needs `control`, which affects the person's real terminal)?

## Decisions

- herdr integration becomes the default transport and the right panel's content when a herdr pane is assigned.
- Use herdr's own observe stream rather than a PTY attach or the herdr TUI.
