# adoc

adoc is a document collaboration system for agents. Its documents are plugin-defined files kept in git, such as TODO lists, task work orders and KANBAN boards. **An agent edits them directly.** A person reads the rendered documents in a web UI and comments on a section or on selected text, or uses buttons, checkboxes and drag-and-drop. Each of those becomes a one-time **message** to the agent. adoc does not depend on any agent harness: an agent can receive messages through the `adoc` CLI, through MCP, or by having them pushed into its herdr pane.

The specification is an aterm corpus, and it is the authority:

| file | contents |
|---|---|
| `spec/adoc.trm` | concepts and contracts |
| `spec/adoc_ui.trm` | web UI regions; React components carry the same names |

Run `aterm corpus check` to validate it.

## Layout

```
spec/                 aterm corpus (adoc.trm, adoc_ui.trm); .aterm/ is its Home
packages/             every folder is a package: package.json, src/, test/, tsconfig.json, its own build
  plugin-kit/           @adoc/plugin-kit: the package every plugin imports; skill/ = how to write a plugin
  core/                 workspace, plugins, documents, messages, transports, server; skill/ = the agent's workflow
  cli/                  the adoc command line and the MCP tool
  webapp/               React 19 + react-router web UI, bundled into its dist/ for core to serve
  testing/              @adoc/testing (private): test helpers every package's tests share (temporary workspaces, free ports)
plugins/              every folder is a plugin: index.ts + skill/SKILL.md (TODO, TASK, KANBAN, NOTE, SKETCH);
                        SKETCH also has package.json and web/, built into client/ (its browser code)
examples/demo/        a demo workspace (port 7701)
docs/                 this repository's own adoc documents (port 7700)
bin/adoc              runs the CLI of this checkout
```

Every agent skill that `adoc skill` shows and installs is the `skill/` folder (with `SKILL.md`) of its owner folder.

## Use

```sh
pnpm install && pnpm build
export PATH="$PWD/bin:$PATH"

cd examples/demo
adoc server run            # web UI at http://127.0.0.1:7701
adoc message wait          # in another terminal: what the agent receives
adoc check                 # problems in the workspace
adoc skill view adoc       # the agent's workflow skill
adoc skill view adoc-plugin-authoring   # how to write a plugin
```

A new workspace is a git repository with `adoc init`, plugins declared in `.adoc/adoc.yaml`, and documents under `docs/`.

Install the agent skills with `adoc skill install` (it runs the Vercel `skills` CLI, `npx skills add`, for every skill folder: adoc's own in user scope, each plugin's in its scope). Every adoc command warns while a skill is missing or older than the running adoc. Plugins can also live in `.adoc/plugins/<name>/` or `~/.config/adoc/plugins/<name>/` and be declared with `from: <name>`.

## Workflow for this repository

Work on adoc itself goes through adoc:

1. **NOTE**: the agent summarizes a conversation into a `NOTE-…` and develops it with the person's comments.
2. **Design in aterm**: the agreed ideas become Terms and contracts in `spec/*.trm`, checked with `aterm corpus check`.
3. **TASK**: a `TASK-…` describes the work, lists the NOTEs it came from in `notes:`, and points at the Terms it implements.
4. **Implement**: the agent works through the TASK, logging progress; the spec may still change during the work and is kept in sync.

## Develop

```sh
pnpm build     # every package builds itself, in dependency order
pnpm test      # build, then each package's tests
pnpm check     # type-check every package, its tests, and plugins/
```
