---
title: herdr integration and the terminal panel
status: RUNNING
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
