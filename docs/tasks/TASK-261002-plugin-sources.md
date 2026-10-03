---
title: plugin sources, layered config and the five plugins as packages
status: REVIEW
assignee: adoc-dev
notes: [NOTE-261002-plugin-sources]
related: [TODO-adoc]
---

## Goal

A workspace declares what it uses as `KEY: <source>` (`npm:`, `github:` or a directory), on top of the user's own config; the five plugins of adoc come with it as npm packages; tabs follow `ui.tabs`.

## Design

Spec Terms (aterm, `spec/adoc.trm`):

- `_Adoc_Config_`: `plugins` is a map from plugin key to `_Plugin_Source_` or `off`; every relative path, `watch` included, is taken from the folder of the file; `ui.tabs`; an earlier format is refused with an error that shows the current one.
- `_User_Config_` (new): `~/.config/adoc/adoc.yaml`, read first; the `_Adoc_Config_` replaces it key by key.
- `_Plugin_Source_` (new): `npm:<package>[@<range>]` resolved from the folder of the declaring file upwards, then from adoc's installation; `github:<owner>/<repo>[/<folder>][#<ref>]` loaded from `<key in lowercase>/` of the `_Plugin_Directory_`; a directory; `peerDependencies` on `@agent-workshop/adoc-plugin-kit` checked at load.
- `_Plugin_Directory_`: `plugins/` next to a config file; `plugins-lock.json` with the fetched commit; fetched folders run as fetched; `adoc plugin update` refuses a changed folder.
- `_Adoc_CLI_`: `adoc plugin install`, `adoc plugin update` (refused through MCP); `adoc init` declares the five plugins as `npm:` sources with `watch: [../docs]` and `ui.tabs`.
- `adoc_ui:Plugin_Tab_Bar_`: order of `ui.tabs`, then the declaration order.

## Method

1. Packages: `plugins/{note,todo,task,kanban}` become `@agent-workshop/adoc-plugin-<name>` like sketch, with `peerDependencies` on the kit; the CLI depends on all five.
2. Core config: new schema, user config layering, paths from the file, `ui.tabs`, old-format error; `adoc init` template.
3. Core plugins: source parsing and resolution (`npm:`, `github:`, directory), peer range check, scope as before.
4. CLI: `adoc plugin install` / `update` for GitHub sources with `plugins-lock.json` (commit and a hash of the fetched files); `plugin list` shows the source.
5. Web UI order from `ui.tabs` (the server sends plugins in tab order).
6. Configs of this repository, the demo and the test fixture in the new format; skills (`adoc`, `adoc-plugin-authoring`) and README.
7. Tests: config layering and paths, source resolution, peer check, GitHub install from a local git repository, init.

## Done when

- [x] `adoc init` in an empty folder writes the five `npm:` plugins, and they load from adoc's installation.
- [x] A key in `~/.config/adoc/adoc.yaml` appears in every workspace, and `KEY: off` in a workspace removes it.
- [x] `./plugins/x` in `.adoc/adoc.yaml` loads `.adoc/plugins/x`, and `watch: [../docs]` watches `docs`.
- [x] A `github:` source is fetched by `adoc plugin install` into `.adoc/plugins/<key>/` with its commit in `plugins-lock.json`; `adoc plugin update` refuses when the folder was changed.
- [x] A plugin whose `peerDependencies` range does not match the kit fails to load with both versions named.
- [x] Tabs follow `ui.tabs`; an old-format config is refused with the new format shown.
- [x] Tests, `pnpm check`, `aterm corpus check` and `adoc check` pass.

## Log

- 2026-10-02: designed in aterm from [[NOTE-261002-plugin-sources]].
- 2026-10-02: packages: NOTE, TODO, TASK, KANBAN became `@agent-workshop/adoc-plugin-<name>` like SKETCH; each builds `dist/index.js` (Node does not strip types inside `node_modules`) and declares `peerDependencies` on the kit; core depends on all five. This repository and the demo keep directory sources (`../plugins/<name>`) so that editing a plugin reloads it.
- 2026-10-02: core: `readConfig(home, env)` lays `.adoc/adoc.yaml` over `~/.config/adoc/adoc.yaml` setting by setting; plugins as `KEY: source` or `off`; paths, `watch` included, from the file; `ui.tabs`; the list format is refused with the new one shown. Sources `npm:` (from the declaring folder upwards, then adoc's installation, with an optional version range), `github:` (from `plugins/<key>/` next to the file), paths; the kit range in `peerDependencies` is checked with semver.
- 2026-10-02: CLI: `adoc plugin install` / `update [KEY…]` fetch GitHub sources with git (`ADOC_GITHUB_URL` overrides the host for tests) into `plugins/<key>/` with `plugins-lock.json` (commit and a hash of the files); update refuses a changed folder; both refused through MCP. `adoc init` declares the five plugins as `npm:` with `watch: [../docs]` and `ui.tabs`; `plugin list` shows the source.
- 2026-10-02: checked: tests for layering and `off`, directory and npm sources, the kit range, tab order, the old format, GitHub fetch / present / update / refused, `adoc init` loading all five from adoc's installation (core 25, CLI 6, kit 11); `pnpm check`, `aterm corpus check`, `adoc check`; servers 7700 and 7701 restarted on the new configs. Not checked: an install from the npm registry (comes with the release checks).
