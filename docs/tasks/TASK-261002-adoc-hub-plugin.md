---
title: adoc-hub, the herdr-ranch plugin (Rust)
status: RUNNING
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
7. Review of the authentication by the herdr-ranch agent (send the diff) before the first install.
8. Release: `scripts/release.sh` with the bookworm build of the server and `.sha256` assets; the exposed port (10954, `[exposed_ports.adoc-hub] web` in the Ranch Server's `server.toml`, set) and `http://adoc.hubbartt.arpa` (port 80, Traefik IngressRoute to 10954, plain HTTP; `192.168.105.35:10954` directly) set up by the k3s owner; the Ranch Server restart that makes `web` appear is done by the herdr-ranch agent at install; install with `herdr-ranch install`.
9. Check on the real network: mldev and segv-mbp, two hosts, approval from each machine, switching, `adoc ui open` across machines, a client leaving and the routing moving.

## Done when

- [ ] `herdr-ranch install` installs adoc-hub; every session opens its status pane.
- [ ] A new browser shows a code; approving it in any session lets it in; rejecting ends it; a revoked browser must approve again.
- [ ] `/adoc-discovery` lists the adoc servers of mldev and segv-mbp with online and offline status and agent status.
- [ ] A browser without an approved cookie gets nothing but the code request: no proxying, no `/adoc-discovery`, no WebSocket upgrade; code requests are rate-limited, codes short-lived and single-use.
- [ ] The pane lists approved browsers with last-seen time; revoking one refuses its cookie and closes its WebSockets at once; cookies are `HttpOnly` and `SameSite=Strict` and never expire.
- [ ] The herdr-ranch agent reviewed the authentication before the first install.
- [ ] `/<host>/` shows each host's web UI, live updates and terminal included; a named host answers at both addresses.
- [ ] With two sessions on one machine, closing the routing client's session moves the routing to the other.
- [ ] `adoc-hub name <name>` run by an agent names its host.

## Log

- 2026-10-02: designed in aterm from [[NOTE-261002-ranch-adoc-hub]]; plugin layout surveyed from herdr-connect, herdr-claude-voice and echo-plugin.
- 2026-10-02: reviewed by the herdr-ranch agent (thread #548): tunnel token, forwarded port per welcome, deterministic routing client, first-answer approvals, herdr-glasses' pairing as the model, agents only from the Directory.
- 2026-10-02: the Owner approved a DNS name for the browser entry (thread #555): port 10954 set in `server.toml`; plugin id must be `adoc-hub`, `[server] exposed_ports = ["web"]`, address from `RANCH_EXPOSED_PORTS`, no prefix, plain HTTP; DNS name and Service port pending with the k3s owner.
- 2026-10-02: browser entry ready (#555, #556): `http://adoc.hubbartt.arpa` on port 80 through Traefik to herdr-ranch:10954 (DNS A record requested, #557; meanwhile `curl -H 'Host: adoc.hubbartt.arpa' http://192.168.105.30/`), also `192.168.105.35:10954`; plain HTTP end to end, LAN/VPN only; nothing authenticates in front, so the approval fails closed; the ranch restart for `RANCH_EXPOSED_PORTS` is done by the herdr-ranch agent at install.
- 2026-10-02: the Owner decided no basicAuth in front (#555): approval is the only gate (user LAN, other VLANs, other houses' VPN); fail closed for every path but the code request, rate-limited single-use short-lived codes, approvals in `RANCH_PLUGIN_DATA_DIR`; auth diff reviewed by the herdr-ranch agent before the first install.
- 2026-10-02: approved cookies must be revocable (#559, from the k3s owner: plain HTTP lets a cookie be sniffed and replayed): approved-browser list with revoke in the pane, effective at once including open WebSockets; expiry (30 days unseen, chosen) and last-seen shown; `HttpOnly`, `SameSite=Strict`. Part of the auth review.
- 2026-10-02: the Owner removed the expiry: approvals never expire (a home network); the last-seen time and revocation stay.
- 2026-10-03: implemented Method 1–6 in `ranch-plugin/` (one crate `adoc-hub`: server with routing pick, tunnel, approval and remap; client with discovery, tunnel end, status pane, `name` and `status`; `fetch-or-build.sh`, `release.sh`, Dockerfile, macOS workflow; release tags `adoc-hub-vX.Y.Z`, never marked latest). 21 unit tests. Checked end to end against `scripts/fake-ranch.mjs` (sessions alpha, beta; hosts 7701, 7702): routing picked beta then moved to alpha (lowest name) and back to beta when alpha's client ended, tunnel reopened each time; without a cookie every path but the code request answers 401, `/adoc-discovery` included; a browser's code reached both clients (status icon `🔑1`), approval reloaded it into the demo web UI under `/mldev_7701/` with live updates through the tunnel; the cookie is `HttpOnly`; the host switcher and `adoc ui open` across hosts work through the hub; revoking closed the open WebSocket at once and further requests got 401; `adoc-hub name demo` named the host, invalid names and directories outside a workspace are refused. Discovery status `unreachable` and the reserved names added to the spec. Next: auth review (Method 7).
- 2026-10-03: auth review by the herdr-ranch agent (#570), all eight points done: Origin must name Host on WebSocket upgrades and non-GET/HEAD (403 otherwise; SameSite does not cover other *.hubbartt.arpa services); the browser's address is the last X-Forwarded-For entry only from the ingress (`ADOC_HUB_TRUSTED_PROXIES`, default k3s pods 10.42.0.0/16), else the peer; host `Set-Cookie` dropped; CSP `script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'` on host HTML (SKETCH's WASM glue needs eval; adoc's markdown renders with `html: false`); the client opens only ports it reported; at most 2 waiting codes per address; the bare-segment redirect only for a valid host segment; bodies over 64 MiB and more than 32 WebSockets per browser refused. Checked with curl through the fake ranch (403/101/404/413 as expected, forged XFF ignored from a direct peer) and in the browser (UI, live updates under the CSP).
- 2026-10-03: second review (#570): `frame-ancestors 'self'` and `X-Frame-Options: SAMEORIGIN` on every HTML page (the hub's own and hosts'), `nosniff` on every response; adoc serves no workspace file raw (documents travel as JSON, files served are built assets). Remaining deployment item (herdr-ranch agent with the k3s owner): 10954 only through Traefik, off the LoadBalancer, so that the only peer in 10.42/16 is the ingress.
- 2026-10-03: the k3s owner (#571): 10954 is off the LoadBalancer, only Traefik may reach it (NetworkPolicy), but servicelb translates every browser to one address. So no address anywhere: the approval shows the code (large, spaced), the time and the user agent; approved browsers keep no address; limits are hub-wide (30 codes per 10 minutes, 10 waiting); the X-Forwarded-For code is gone. The herdr-ranch agent cleared the first install with these and the frame-ancestors/nosniff change.
- 2026-10-03: released adoc-hub-v0.1.0 (master f6636e9) and installed it on the ranch (`herdr-ranch install …@adoc-hub-v0.1.0` after the herdr-ranch agent's restart); all 6 sessions run the client (ranch fixed its ensure for plugins installed by another session of the machine, cd2eb0a). The hub found no hosts at first: mldev had no `adoc` program and segv-mbp ran 0.1.2 (no `server list`). Released adoc 0.1.3 (npm, tag v0.1.3) and installed it on both; segv-mbp's server restarted on 0.1.3. The hub now lists mldev_7700 (adoc-dev working), mldev_7701, segv-mbp_7700 (adoc-test idle). The Owner's browser was approved (905814).
- 2026-10-06: herdr-ranch #580: after a Ranch Client restart the client kept redialing the old url (cached in its Endpoint) and never came back. The client now runs one connection after another and reads the session file again before each (as herdr-connect 0.7.10 does); discovery, the tunnel and the status icon end with their connection. Checked against the fake ranch moved from 7795 to 7798: reconnected 2 s later. Released as adoc-hub-v0.1.1.
- 2026-10-07: herdr-ranch #661: three clients stayed stuck after the 0.1.0 -> 0.1.1 update and did not rejoin after a ranch server restart. Cause: herdr installs updates in place, so current_exe() named the replaced file ('… (deleted)') and the re-exec after plugin_updated failed; the ranch task ended but the status screen kept the process alive, so ranch never reopened the pane. Fixed: re-exec the absolute argv[0] (the new binary), and the client ends when its ranch side ends. The redial after ranch_network_disconnect was already right. fake-ranch.mjs gained /admin/notify and /admin/server-restart; checked: server restart -> welcome after the outage; in-place replacement + plugin_updated -> same pid on the new binary, welcome; a failed re-exec in a real tty -> exit 1.
