# adoc-hub

A herdr-ranch plugin that shows every adoc on the ranch network in one browser. The spec is `spec/adoc_hub.trm` in this repository.

- The **plugin server** runs once, next to the Ranch Server. It serves browsers on the exposed port `web` (`http://adoc.hubbartt.arpa`).
- A **persistent client** runs in every herdr session and draws the status pane `adoc-hub`.
- On each machine, the client of the session with the lowest name is the **routing client**. It reports the adoc servers of its machine (`adoc server list`) and carries their traffic through one WebSocket to the server's forwarded port `tunnel`.
- A browser first shows a six-digit code. Approve it with `a` in the `adoc-hub` pane of any session. Until then the hub answers nothing but the code request.

## Using it

| where | what |
|---|---|
| browser | `http://adoc.hubbartt.arpa/` lists the hosts; `/<host>/` is a host's web UI, where `<host>` is `<machine>_<port>` or a given name |
| `adoc-hub` pane | `Tab` moves between lists, `↑`/`↓` select; `a` approves and `r` rejects the waiting browser; `n` names the selected host; `x` revokes the selected browser; `Ctrl-C` ends the client |
| shell, in an adoc workspace | `adoc-hub name <name>` names its host; `adoc-hub name --clear` removes the name |
| shell | `adoc-hub status` shows ranch, the `adoc` program and the adoc servers of this machine |

The client finds `adoc` through `ADOC_BIN`, then `PATH`, then the user's login shell (`$SHELL -lic 'command -v adoc'`).

## Layout

```
src/
  server/        the plugin server: Directory, routing client per machine, hosts, names
    tunnel.rs      the server end of the tunnel (streams per request and WebSocket)
    web.rs         the browser side: approval (fail closed), /adoc-discovery, /<host>/… remap
  client/        the persistent client: hello, reports, the tunnel's client end, the name and status commands
  auth.rs        codes, cookies (hash only), rate limit, revocation
  proto.rs       datagrams and tunnel frames
  discovery.rs   adoc server list and /api/workspace
  tui.rs         the status pane
  ranch.rs       the Ranch Api client (vendored from herdr-connect)
web/             the approval page, the host list, the "host unavailable" page
scripts/         fetch-or-build.sh (herdr's build step), release.sh, fake-ranch.mjs (local runs)
```

## Develop

```sh
cargo test
```

To run it without a ranch network:

1. Start `node scripts/fake-ranch.mjs 7795 /tmp/hub-run alpha beta`.
2. Start the server with `RANCH_URL=http://127.0.0.1:7795`, `RANCH_PLUGIN_DATA_DIR=/tmp/hub-data` and `RANCH_EXPOSED_PORTS='{"web":"127.0.0.1:7796"}'`, then run `target/debug/adoc-hub server`.
3. Start a client per session with `RANCH_RUNTIME_DIR=/tmp/hub-run`, `HERDR_SESSION=alpha` and `ADOC_HUB_PLAIN=1`, then run `target/debug/adoc-hub client run`.
4. Approve a browser by sending the datagram `{"t":"decide","code":"…","approve":true}` to `ranch://central/plugin/adoc-hub` as a client: `POST http://127.0.0.1:7795/s/alpha/plugin/adoc-hub/7/send?to=…`.

## Release

From the `master` worktree, run `scripts/release.sh`.

1. The script tags `adoc-hub-vX.Y.Z` once `Cargo.toml` and `herdr-plugin.toml` agree.
2. It builds the Linux asset in the Dockerfile (Debian bookworm, glibc 2.36, the Ranch Server's pod) and creates the GitHub release. The release is not marked latest.
3. `.github/workflows/adoc-hub-release.yml` adds the macOS assets.

Install with `herdr-ranch install dirty49374/adoc/ranch-plugin@adoc-hub-vX.Y.Z`, always with the tag.
