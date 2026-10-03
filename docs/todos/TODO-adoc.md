# adoc follow-ups

## Plugins

- [ ] Plugin hot reload re-imports only index.ts; decide whether multi-file plugins are allowed
- [x] Plugins: register a source (GitHub URL etc.) for a plugin so that `adoc plugin update` can update it, see [[NOTE-261002-installation]]; done: [[TASK-261002-plugin-sources]] (`github:` sources, `adoc plugin install`/`update`, `plugins-lock.json`)
- [x] TODO plugin: grouping, e.g. `## Group` headings between items (today headings are ignored and all items show as one flat list); done: `## Heading` starts a group with a done count, anchor = heading line

## Release

- [x] Ship the web UI with the published packages: publish `@agent-workshop/adoc-webapp`, or put its build into the core package (to decide); done: published as `@agent-workshop/adoc-webapp` (decided), with its metadata
- [x] Ship the five plugins (NOTE, TODO, TASK, KANBAN, SKETCH) with adoc, and let `adoc init` declare them; then change the `adoc` skill, which tells to declare them by a path into this repository; done: [[TASK-261002-plugin-sources]] (npm packages `@agent-workshop/adoc-plugin-<name>`, `adoc init` declares them)
- [x] Build the SKETCH client (`plugins/sketch/client/`, not in git) as part of the release build, with its libraries bundled; done: `pnpm build` builds it, and the package carries `client/` with its licenses
- [x] Package metadata for every published package: `files` (dist and `skill/`), `repository`, `engines.node >=24`, `publishConfig.access: public`; a notice file for the third-party code and fonts the bundles carry; done: `files`, `repository` (github.com/dirty49374/adoc), `engines`, `publishConfig`; LICENSE and THIRD_PARTY_NOTICES.md copied at pack time; license inventories of both bundles (`tooling/licenses.mjs`)
- [x] License: 0BSD, as aterm; done: LICENSE and `license` in every package.json
- [x] Install check from `npm pack` tarballs in an empty folder: `adoc init`, `server run`, web UI, `skill install`, plugin load, MCP; the resolve hook of `@agent-workshop/adoc-plugin-kit` inside `node_modules`; done: nine tarballs in an empty folder with a temporary HOME: init, plugin list (all five from node_modules), skill install, server (UI, fonts, SKETCH client), MCP (plugin install refused)
- [x] A README for users (install, requirements: Node 24, herdr 0.9.3 or later recommended, git; quick start); move the developer part elsewhere; done: README.md for users, CONTRIBUTING.md for developers with the release steps
- [x] Warn when the server listens beyond loopback without authentication; done: a warning line at server start
- [x] Versioning: start at 0.1.0, move all packages together; how a plugin states the plugin-kit version it needs (see [[NOTE-261002-plugin-sources]]); done: all packages share one version, 0.1.0 first (CONTRIBUTING.md); plugins state the kit range in `peerDependencies`
- [ ] Publish adoc as public npm packages, see [[NOTE-261002-installation]]
- [ ] After publishing: CI (build, test, check, `aterm corpus check`) and publish on tags
- [x] Rename the packages into the npm org `@agent-workshop` (aterm's org), each as `adoc-…` so no name clashes there: `@agent-workshop/adoc` (the CLI, command `adoc`), `@agent-workshop/adoc-core`, `@agent-workshop/adoc-plugin-kit`, `@agent-workshop/adoc-webapp`, `@agent-workshop/adoc-plugin-sketch`, `@agent-workshop/adoc-testing` (private); plugins and the skills import `@adoc/plugin-kit` today, so the resolve hook, the plugins and both skills change too; done: every package, import, the resolve hook, both skills, the spec and the README use the new names

## Web UI

- [ ] Idea: show the agent's herdr window in the web UI
- [x] Web UI: switch the terminal into the main area (the side panel stays fixed), and back; done: the ↔ button on the panel resizer swaps the sides of the main area and the dock
- [x] Web UI: tell the terminal from the main area: a subtly different background, or a very thin vertical rule between them; done: the _Panel_Resizer_ shows a 1px rule in --adoc-border-subtle
- [x] Web UI: horizontal and vertical scrollbars always show on the page (new, since the UI polish); not reproduced in the demo, which has no terminal panel, so suspect the terminal panel (xterm.js sizing) first; done: likely the same cause as the IME drift (cells measured with the fallback font, so rows rendered in D2Coding were wider than the dock), fixed by opening the terminal after its fonts; the terminal host now also clips overflow; to confirm by the user
- [x] Plugin tab order NOTE | TODO | SKETCH | TASK | KANBAN, set in this repository's `.adoc/adoc.yaml` (tabs follow the order of `plugins`)
- [x] Plugin tab click: unfold the list pane and open its top document; fold the list pane again when the pointer leaves both the tab bar and the list pane
- [x] Composer: when the document list pane is pinned (takes its width), the composer stays centred on the whole main area instead of moving with the reading column

## Document list pane

- [x] Document list pane: show each title on exactly two lines (later changed by the user to one line with an ellipsis, for a fixed row height) (fitted to the current titles); a longer title is cut and shown whole in a popup on hover; done: fixed two-line title block (line-clamp), the whole title in a fixed floating card over a cut title
- [x] Document list pane: sort by last update, newest first, by default; add a sort control with more orders (key, title, status); done: summary list entries carry updatedAt (newest file mtime), the _Document_Sort_Picker_ in the pane title sorts in the browser, remembered as adoc.list-sort
- [x] Document list pane: show the last update in small text, relative ("updated 5 min ago"); done: a third meta line in each _Document_Row_, full date and time on hover, renewed every minute
- [x] List pane title: write the skill link as `KANBAN | SKILL.md` (a separator between the plugin key and the link)

## Documents and skills

- [x] Change view: pick any older version kept in memory as the base (version picker), see [[NOTE-261002-note-plugin]]
- [x] Markdown documents: edit in the web UI (e.g. answer an open question by typing right below it); an edit reaches the agent with a diff of what the user changed, see [[NOTE-261002-client-plugins]]; done: [[TASK-261002-document-edit]] (whole main file of any document)
- [x] Markdown: render Mermaid diagrams in ```mermaid fences (code syntax highlighting already works: fenced code with a language, highlight.js, since the UI polish); done: drawn by the web UI with Mermaid 12, loaded on demand (the web UI bundle is now split into chunks)
- [x] Skill view: comments on selected text (the comment popover of a document body) do not work on a SKILL.md yet; only the composer can target `skill <name>`

## Terminal

- [x] Terminal mouse clicks: forward as `terminal.mouse` once herdr is updated (0.9.1 has no mouse command; docs for 0.9.3 list it), see [[TASK-261002-herdr-integration]]
- [x] Terminal scroll speed: wheel scrolling feels slow; tune lines per wheel step and frame latency, see [[TASK-261002-herdr-integration]]; done: 10 lines per wheel notch (was 6), sent every animation frame (was every 50 ms); to check by the user
- [x] Terminal: Shift+Enter does not work (xterm.js sends a plain Enter; the agent expects its newline sequence); done: sent as ESC CR (Alt+Enter); to check by the user on the claimed pane

## Development

- [x] CLI tests import the core test fixture across packages; give tests one shared place; done: private workspace package `@adoc/testing`
