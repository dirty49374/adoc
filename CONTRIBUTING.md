# Contributing to adoc

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
  plugin-kit/           @agent-workshop/adoc-plugin-kit: the package every plugin imports; skill/ = how to write a plugin
  core/                 workspace, plugins, documents, messages, transports, server; skill/ = the agent's workflow
  cli/                  the adoc command line and the MCP tool
  webapp/               React 19 + react-router web UI, bundled into its dist/ for core to serve
  testing/              @agent-workshop/adoc-testing (private): test helpers every package's tests share (temporary workspaces, free ports)
plugins/              every folder is a plugin and a package @agent-workshop/adoc-plugin-<name>: index.ts + skill/SKILL.md,
                        built into dist/index.js for npm; SKETCH also has web/, built into client/ (its browser code)
tooling/              release helpers: license collection of the bundles, files copied into each package at pack time
examples/demo/        a demo workspace (port 7701)
docs/                 this repository's own adoc documents (port 7700)
bin/adoc              runs the CLI of this checkout
```

Every agent skill that `adoc skill` shows and installs is the `skill/` folder (with `SKILL.md`) of its owner folder.

## Run from this checkout

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

## Branches and worktrees

```
~/work/adoc/
  .bare/          the repository (bare); .git points to it
  master/         worktree of master: what is released
  dev/            worktree of dev: daily work
  <feature>/      worktree of a feature branch, when a piece of work needs one
```

- Work happens on `dev`. A larger piece of work gets a feature branch in its own worktree:
  `git worktree add ../<feature> -b <feature> dev`, merged back into `dev` when done, then
  `git worktree remove ../<feature>`.
- A release merges `dev` into `master` and is packed and published from the `master` worktree.
- Each worktree has its own `node_modules` and builds: run `pnpm install && pnpm build` in a new one.
- `.adoc/claim.yaml` is per worktree and per machine: claim again with `adoc agent claim` in the
  worktree whose server runs.

## Workflow for this repository

Work on adoc itself goes through adoc:

1. **NOTE**: the agent summarizes a conversation into a `NOTE-…` and develops it with the user's comments.
2. **Design in aterm**: the agreed ideas become Terms and contracts in `spec/*.trm`, checked with `aterm corpus check`.
3. **TASK**: a `TASK-…` describes the work, lists the NOTEs it came from in `notes:`, and points at the Terms it implements.
4. **Implement**: the agent works through the TASK, logging progress; the spec may still change during the work and is kept in sync.

## Develop

```sh
pnpm build     # every package builds itself, in dependency order
pnpm test      # build, then each package's tests
pnpm check     # type-check every package, its tests, and plugins/
```

## Release

All packages share one version and move together; `0.1.0` is the first.

```sh
pnpm build                                   # also collects the licenses of the bundled browser code
pnpm -r --filter './packages/*' --filter './plugins/*' --filter '!@agent-workshop/adoc-testing' pack --pack-destination dist
```

- `pnpm pack` replaces `workspace:*` with the version and runs each package's `prepack`, which copies `LICENSE` and `THIRD_PARTY_NOTICES.md` into it, and for the CLI also `README.md` with its relative links made absolute for npm (`tooling/package-files.mjs`).
- The builds of the web UI and the SKETCH client write the inventory and license files of every bundled package into `dist/licenses/` and `client/licenses/` (`tooling/licenses.mjs`); a package published without a license file needs its upstream text in `tooling/licenses/<name>/`.
- Before publishing, install the tarballs into an empty folder (with a temporary `HOME`) and try `adoc init`, `adoc plugin list`, `adoc skill install`, `adoc server run` and `adoc mcp run`.
