---
title: adoc-hub, the herdr-ranch plugin (Rust)
status: TODO
assignee: adoc-dev
notes: [NOTE-261002-ranch-adoc-hub]
related: [TASK-261002-hub-embedding]
---

## Goal

One browser at the hub's address shows every adoc on the ranch network: the person approves the browser once from any herdr session, picks a host from the list and works there as if connected directly.

## Design

Spec Terms (aterm, `spec/adoc_hub.trm`):

- `_Adoc_Hub_`: a ranch plugin in `ranch-plugin/` of this repository, laid out like herdr-connect (one crate, one binary: `server`, `client run`, `client status`, `name`).
- `_Hub_Server_`: exposed port `web` for browsers (address from `RANCH_EXPOSED_PORTS`, plain HTTP at `/`), forwarded port `tunnel` for clients; state in `RANCH_PLUGIN_DATA_DIR`.
- `_Hub_Client_` and `_Local_Discovery_`: `adoc server list --output json` every few seconds, `adoc` found by `ADOC_BIN`, `PATH`, then the user's login shell; details from `/api/workspace`.
- `_Hub_Host_`, `_Hub_Host_Name_`: `<machine>_<port>` or a given name, both answering.
- `_Routing_Client_`: one per machine, the lowest session name with a client in the Directory; picked again on `peer_left`, `directory_change` and server start (seeded from the snapshot).
- `_Hub_Tunnel_`: one WebSocket per machine, numbered streams for HTTP requests and WebSockets; datagrams only for signals and reports; a token sent by datagram and checked on the first frame; the forwarded port looked up again after every welcome.
- `_Hub_Discovery_` (`/adoc-discovery` and its change stream), `_Hub_Remap_` (`/<host>/…` with `X-Forwarded-Prefix` and `X-Adoc-Hub`).
- `_Browser_Approval_`: herdr-glasses' pairing flow and cookie handling; the server takes the first answer and tells every client; pending requests in the herdr sidebar icon.
- `_Hub_Status_Screen_` (ratatui in the ranch pane) and `_Hub_Name_Command_`.

## Method

1. Scaffold `ranch-plugin/` from herdr-connect: Cargo crate, `herdr-plugin.toml`, `ranch.toml` (`persistent_client`, `[pane]`, `[server]` with `exposed_ports = ["web"]`), `scripts/fetch-or-build.sh`, the vendored Ranch Api helpers or `ranch-api`.
2. Server: Ranch Api welcome, Directory subscription, routing-client choice per machine, host list, names and approvals in the data dir.
3. Tunnel: framing for streams (open, data, close, WebSocket messages), server side in axum, client side forwarding to `127.0.0.1`.
4. Browser side of the server: `/adoc-discovery` (JSON and SSE), `/<host>/…` remap for HTTP and WebSocket, the approval page and cookie.
5. Client: local discovery with the `adoc` lookup, reports on change, tunnel when asked; the `name` command as a transient client sending to the server.
6. Status screen from herdr-glasses' console: hosts, names (edit), waiting approvals (approve, reject), revocation; plain output when not a TTY; never open the pane itself when ranch is on; re-exec on `plugin_updated`; end on Ctrl-C.
7. Release: `scripts/release.sh` with the bookworm build of the server and `.sha256` assets; the exposed port (10954, `[exposed_ports.adoc-hub] web` in the Ranch Server's `server.toml`, set) and a k3s Service port and LAN DNS name (asked of the k3s owner); the Ranch Server restart that makes `web` appear is done by the herdr-ranch agent at install; install with `herdr-ranch install`.
8. Check on the real network: mldev and segv-mbp, two hosts, approval from each machine, switching, `adoc ui open` across machines, a client leaving and the routing moving.

## Done when

- [ ] `herdr-ranch install` installs adoc-hub; every session opens its status pane.
- [ ] A new browser shows a code; approving it in any session lets it in; rejecting ends it; a revoked browser must approve again.
- [ ] `/adoc-discovery` lists the adoc servers of mldev and segv-mbp with online and offline status and agent status.
- [ ] `/<host>/` shows each host's web UI, live updates and terminal included; a named host answers at both addresses.
- [ ] With two sessions on one machine, closing the routing client's session moves the routing to the other.
- [ ] `adoc-hub name <name>` run by an agent names its host.

## Log

- 2026-10-02: designed in aterm from [[NOTE-261002-ranch-adoc-hub]]; plugin layout surveyed from herdr-connect, herdr-claude-voice and echo-plugin.
- 2026-10-02: reviewed by the herdr-ranch agent (thread #548): tunnel token, forwarded port per welcome, deterministic routing client, first-answer approvals, herdr-glasses' pairing as the model, agents only from the Directory.
- 2026-10-02: the Owner approved a DNS name for the browser entry (thread #555): port 10954 set in `server.toml`; plugin id must be `adoc-hub`, `[server] exposed_ports = ["web"]`, address from `RANCH_EXPOSED_PORTS`, no prefix, plain HTTP; DNS name and Service port pending with the k3s owner.
