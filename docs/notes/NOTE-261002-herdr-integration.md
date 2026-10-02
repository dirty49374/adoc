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

- **Korean IME:** xterm.js takes input through a hidden textarea and handles composition events (`compositionstart` / `compositionend`); `onData` delivers the composed syllables, which adoc sends as text. Known rough edges are the position of the candidate window and duplicated characters in some browser and xterm.js versions, so Korean input needs a test early.
- **Finding the agent's own pane (from herdr-connect):** a tool shell may run in another process, such as a Codex app-server, whose `HERDR_PANE_ID` belongs to the daemon. hc therefore identifies the agent by its session id (`CLAUDE_CODE_SESSION_ID`, `CODEX_SESSION_ID`), which herdr records per pane as `agent_session.value`. It looks up the pane with that session id across the herdr session sockets, ignores `HERDR_PANE_ID` when the process descends from a shared daemon (`codex app-server`), and otherwise falls back to an explicit binding. `adoc agent claim` can follow the same order: `--pane` given, then session id → pane, then `HERDR_PANE_ID` when no shared daemon is in the process tree.
- **Right panel (the person's idea, worked out):** the terminal fills the right panel; draft comments move into the content area as margin cards next to their anchors, like comments in a word processor; under the terminal a one-line composer bar shows the drafts as chips (click a chip to jump to its card) with a text field and Send; typing directly in the terminal also works. Pending messages shrink to a badge on the bar, since a herdr push delivers them at once.
- **Terminal stream:** the adoc server spawns `herdr terminal session control <agent pane> --cols W --rows H` at the browser's size and forwards the decoded frames over the existing WebSocket; the web UI renders them with xterm.js in the right panel. Other tabs watch through `observe`. No node-pty, no herdr TUI in the browser.
- **Input:** keys typed in the terminal go to the pane as `terminal.input` on the control stream; resizing the browser sends `terminal.resize`. Drafts and the composer still exist and are sent with `agent.prompt` in the adoc message format, so structured comments keep working next to free typing.
- **Claiming the role:** `adoc agent claim` run by the agent inside its pane reads `HERDR_SOCKET_PATH` and its own pane from the environment, and makes that pane the assigned agent; the previous holder loses the role. `adoc server run --agent-pane <pane>` does the same at start.
- **Status:** one `events.subscribe` connection shows the agent's state (working, idle, done) and notices when the pane closes.
- **Fallback:** without herdr (or when the pane is gone), the right panel shows the message dock as today and the wait transport stays available.
- **Naming:** follow herdr's terms: observe (read-only), control (read-write), pane, terminal. Avoid "mirror" for the live stream.

## Open questions

- Is the right-panel layout above what you have in mind?
- When the browser resizes the pane to its window, the person's real herdr terminal changes size too; is that acceptable while the web UI is in control, with `terminal.release` returning control when the tab closes?

## Decisions

- herdr integration becomes the default transport and the right panel's content when a herdr pane is assigned.
- Use herdr's own observe stream rather than a PTY attach or the herdr TUI.
- The claim is written to a separate file, not to `.adoc/adoc.yaml`.
- The browser gets full keyboard control of the terminal (`herdr terminal session control`).
- The terminal follows the size of the browser window.
- Identify the agent's pane the way herdr-connect does (session id first), so that Codex tool processes work.
