---
title: adoc under a hub (server list, base path, host switcher)
status: REVIEW
assignee: adoc-dev
notes: [NOTE-261002-ranch-adoc-hub]
related: [TASK-261002-adoc-hub-plugin]
---

## Goal

adoc works both directly and through the adoc hub: `adoc server list` tells programs which servers run, and the web UI works under a prefix such as `http://hub/mldev_7700/`, switches hosts and follows `adoc ui open` across hosts. Nothing changes for a direct connection.

## Design

Spec Terms (aterm):

- `_adoc:Server_Record_`: written atomically; other programs read records only through `adoc server list`.
- `_adoc:Server_List_Command_` (new): `adoc server list [--output json]` with `workspace`, `url`, `pid`, `status` (online when the process runs and `/api/health` answers with the same workspace); records whose workspace has no `adoc.yaml` are deleted; needs no workspace.
- `_adoc:Web_UI_Base_` (new): the server puts the base (`X-Forwarded-Prefix`, else `/`) and the hub's discovery path (`X-Adoc-Hub`) into `index.html`; locations handed to browsers are relative to it.
- `_adoc:Adoc_Web_UI_`: every browser storage key names the workspace; every API, WebSocket, asset and route is under the base.
- `_adoc_ui:Host_Switcher_` (new) and `_adoc_ui:App_Shell_`: the menu replaces the workspace name under a hub; presence connections to every online host of the same protocol so that `adoc ui open` anywhere moves this browser.

## Method

1. Core: atomic `writeServerRecord`; `adoc server list` in the CLI (no home needed), with the online check and the cleanup.
2. Server: read `X-Forwarded-Prefix` and `X-Adoc-Hub` per request, replace `__ADOC_BASE__` and `__ADOC_HUB__` in `index.html`; `ui.open` locations relative to the base.
3. Web UI: one `base` for fetch, WebSocket and asset URLs and the router's `basename`; plugin client modules under the base; storage keys `adoc.<workspace id>.<name>` (with the workspace id from `/api/workspace`), moving the old keys once.
4. Web UI under a hub: `_Host_Switcher_` reading `/adoc-discovery` and its change stream; remembered location per host; presence connections (one browser session per online host) that switch the host on `ui.open`.
5. A fake hub for tests and development: a small proxy that serves `/adoc-discovery` from `adoc server list` and remaps `/<machine>_<port>/` on this machine, so that this TASK does not wait for the Rust plugin.
6. Skills: the `adoc` skill mentions `adoc server list`; tests for the command, the base injection and a browser check through the fake hub.

## Done when

- [x] `adoc server list --output json` lists the servers of this computer with online and offline status, from any directory.
- [x] A server record is never read half-written (atomic write).
- [x] Through the fake hub, the web UI works under `/<host>/`: documents, comments, actions, live updates, the terminal and plugin client modules (SKETCH).
- [x] The host switcher lists the hosts with their state and switches; `adoc ui open` in another workspace moves the browser to that host.
- [x] Drafts and choices of two workspaces under one origin stay apart.
- [x] A direct connection behaves as before; tests, `pnpm check`, `aterm corpus check` and `adoc check` pass.

## Log

- 2026-10-02: designed in aterm from [[NOTE-261002-ranch-adoc-hub]].
- 2026-10-02: implemented. `adoc server list` (core `listServers`, atomic record write); `X-Forwarded-Prefix`/`X-Adoc-Hub` put into `index.html` as `<base>`, `adoc-hub` and `adoc-workspace`; the web UI resolves fetch, WebSocket, assets, plugin modules and routes under the base; storage keys `adoc.<workspace id>.<name>`; `/api/workspace` tells `id` and `version`; `_Host_Switcher_` (`hub.ts`, `HostSwitcher.tsx`) with presence connections and the last location per host; `tooling/dev-hub.mjs` as the stand-in hub (optional list of server ports, so tests stay off other servers).
- 2026-10-02: checked through the dev hub with 7701 (demo) and 7702 (a scratch workspace): the menu lists both with state, switching keeps each host's last location, `adoc ui open` in 7701 moved the browser from 7702 to 7701, and a direct connection shows the workspace name as before. Tests, `pnpm check`, `aterm corpus check` and `adoc check` pass.
