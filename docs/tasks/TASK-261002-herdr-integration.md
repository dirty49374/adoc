---
title: herdr integration and the terminal panel
status: REVIEW
assignee: adoc-dev
notes: [NOTE-261002-herdr-integration, NOTE-261002-right-panel-layout]
related: [KANBAN-adoc]
---

## Goal

herdr becomes the default way adoc reaches the agent: the agent claims its herdr pane, messages are pushed to that pane, and the right panel of the web UI shows the agent's live terminal with full keyboard control. Drafts move into the document as markers and into the composer bar as chips.

## Design

Spec Terms (aterm, `spec/adoc.trm` and `spec/adoc_ui.trm`):

- `_Agent_Claim_`, `_Agent_Claim_Command_`: `.adoc/claim.yaml`, `adoc agent claim | show`, `adoc server run --agent-pane`
- `_User_Message_Transport_`: herdr is the default kind, targeting the claimed pane
- `_Agent_Terminal_Stream_`: `herdr terminal session control` / `observe`, `terminal.input | resize | scroll | release`, herdr events for status
- UI: `_Message_Dock_` (terminal or pending messages), `_Terminal_Panel_`, `_Panel_Resizer_`, `_Draft_Marker_Column_`, `_Draft_Chip_List_`, `_Agent_Pane_Label_`

## Method

1. **Claim**: herdr socket client in core (NDJSON); pane lookup by session id across `~/.config/herdr/sessions/*/herdr.sock`, then `HERDR_PANE_ID` unless under `codex app-server`; `adoc agent claim | show`; `--agent-pane`; `.adoc/.gitignore` from `adoc init`.
2. **Transport**: herdr kind reads the claim; `agent.prompt` delivery; hold messages without a claim or when the pane is gone; server follows `claim.yaml`.
3. **Terminal stream**: spawn `session control` for the controlling browser session and `observe` for others; relay base64 frames over the WebSocket; input, resize, scroll, release; `events.subscribe` for agent status and pane closing.
4. **Web UI**: xterm.js `_Terminal_Panel_` in the right panel with focus-to-control; `_Panel_Resizer_`; `_Agent_Pane_Label_`; `_Draft_Marker_Column_` with hover cards; `_Draft_Chip_List_` in the composer bar; the draft list leaves the dock.
5. **Tests and checks**: unit tests for claim resolution and the herdr client (fake socket); browser test on a scratch herdr pane (never on the person's or the agent's own pane); Korean IME check.

## Done when

- `adoc agent claim` in this pane makes it the assigned agent; a comment sent from the web UI arrives in this pane as a prompt.
- The right panel shows the live terminal of the claimed pane; typing there (including Korean) reaches the pane; resizing the panel resizes the pane; closing the tab releases it.
- Drafts show as markers in the document and as chips in the composer bar.
- Tests, `pnpm check` and `aterm corpus check` pass.

## Log

- 2026-10-02: designed in aterm from [[NOTE-261002-herdr-integration]] and [[NOTE-261002-right-panel-layout]].
- 2026-10-02: core: herdr socket client, pane lookup (session id → HERDR_PANE_ID unless under codex app-server), `.adoc/claim.yaml`, herdr as the default transport (`agent.prompt`, typed input while no agent is detected), terminal relay over `herdr terminal session control | observe`, agent status through herdr events.
- 2026-10-02: CLI: `adoc agent claim | show`, `adoc server run --agent-pane`, `adoc init` writes `.adoc/.gitignore`.
- 2026-10-02: web UI: terminal panel (xterm.js, click to control, resize follows the panel), panel resizer, agent pane label, draft markers with hover cards, draft chips.
- 2026-10-02: verified on a scratch shell pane: live frames, typing (including Korean text), resize 55 → 88 columns, message push; then claimed this session's pane w2B:p1. Tests: 28 passing.
- 2026-10-02: Korean IME confirmed by the person.
- 2026-10-02: fixed: the panel could not grow on windows narrower than about 1150px (width limit too strict), and resizing in an observing tab did not reach the pane; dragging the border now takes control in that tab.
