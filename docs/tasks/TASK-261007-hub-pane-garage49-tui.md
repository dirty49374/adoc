---
title: adoc-hub status pane on the garage49 TUI design system; no status_command
status: REVIEW
assignee: adoc-dev
notes: [NOTE-261002-ranch-adoc-hub]
related: [TASK-261002-adoc-hub-plugin]
---

## Goal

The adoc-hub pane is built with the garage49 TUI design system (`garage49-tui-iocraft`), as the Owner decided for every plugin (herdr-ranch #678), and shows what ranch's `status_command` showed plus the hub's own details; ranch no longer runs a plugin program.

## Design

Spec Terms (aterm, `spec/adoc_hub.trm`):

- `_adoc_hub:Hub_Status_Screen_`: also the state of its own client (ranch connection, routing and tunnel, the adoc program, the machine's adoc servers, a log); built with the garage49 TUI; sidebar layout, pages Waiting, Hosts, Browsers (hub) and Status, Log (this session).

## Method

1. `ranch.toml`: drop `status_command`; drop the `adoc-hub status` subcommand that existed for it.
2. `Cargo.toml`: `garage49-tui-iocraft` (git, pinned to the library's commit), `iocraft`, `smol`; drop ratatui.
3. `tui.rs`: `App > Content > Sidebar + Main`; pages as tables and labels from the library; keys `a`/`r` on Waiting, `n` on Hosts (a text field), `x` on Browsers, active only while Main is focused and nothing is typed; the board polled from the client's shared state; commands sent as datagrams; `run` in `spawn_blocking`.
4. Client: the screen ends the client (q, ctrl+c); when the ranch side ends, restore the terminal and exit; re-exec restores the terminal first.
5. Check in a 110×32 tmux pane against the gallery, and at small sizes; fake ranch for data.

## Done when

- [x] No `status_command`, no `status` subcommand, no ratatui.
- [x] The pane shows the five pages with the hub's data; approve, reject, name and revoke work from it.
- [x] q / ctrl+c end the client and restore the terminal; plugin_updated re-execs; a failed re-exec ends the client.
- [x] `cargo test`, clippy, `pnpm check`, `aterm corpus check` pass.

## Log

- 2026-10-07: from the Owner's decision relayed by herdr-ranch (#678).
- 2026-10-07: done. `status_command` and the `status` subcommand removed; ratatui replaced by `garage49-tui-iocraft` (git, rev 44c169b) with iocraft and smol. `tui.rs`: root `HubScreen` renders App only and polls the board every 250 ms; pages Waiting, Hosts, Browsers, Status, Log as library Tables, Labels, a TextField and a LogView; page keys active only while Main is focused and nothing is typed. The client ends with the screen (q confirmed, ctrl+c) and when its ranch side ends; re-exec restores the terminal. Checked in a 110×32 tmux pane against the fake ranch with the demo host: approve from the pane, naming twice, Status and Log pages, q and ctrl+c exit 0 with the terminal restored, plugin_updated re-execs the same pid onto the replaced binary with the screen redrawn, 60×20 / 40×12 / 30×7 degrade as the design system says. 24 tests, clippy clean.
- Library gaps found (reported to garage49-tui): a TextField removed while editing leaves the app typing for good (worked around by design: the Name field stays and takes the keys only while naming); characters typed faster than renders overwrite each other (paste); App's extra key hints are shown but a click on one does nothing; at 40 columns the status line's segments overlap.
- 2026-10-07: garage49-tui fixed the four gaps in ddd505d (#679); repinned. The page selections, the name being typed and the status message moved into one root state (`Ui`), so a key on a page and a click on its key hint run the same action (KeyHint::with_action); a Reporter inside App puts the message on the status line. Checked again in tmux: approve by key reports 'approved …', a burst 'demo' arrives whole, the Hosts hints switch to enter/esc while naming. 24 tests, clippy clean.
- 2026-10-07: garage49-tui 6997c5a changed page assembly (#688): pages re-assembled as an Intro (Waiting only) and titled Sections; Hosts adds a 'Name of the selected host' section with a Form; Status shows the client facts as a List, the adoc program in its own section and the machine's servers as a Table (long values had pushed List labels out). Checked every page in the 110×32 tmux pane.
