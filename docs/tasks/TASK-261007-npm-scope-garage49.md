---
title: npm scope @agent-workshop -> @garage49, with a transition for old names
status: REVIEW
assignee: adoc-dev
notes: [NOTE-261007-npm-scope-garage49]
---

## Goal

adoc's packages are published as `@garage49/*` from the next release; existing workspaces and third-party plugins that still name `@agent-workshop/*` keep working and are told what to change.

## Design

Spec Terms (aterm, `spec/adoc.trm`):

- `_adoc:Plugin_Kit_`, `_adoc:Plugin_Source_`: the package names are `@garage49/…`; for one transition period `npm:@agent-workshop/<name>` reads as `npm:@garage49/<name>`, and a plugin importing or declaring `@agent-workshop/adoc-plugin-kit` is treated as one with `@garage49/adoc-plugin-kit`.
- `_adoc:Adoc_Check_Command_`: a warning for every plugin source still naming `@agent-workshop`, with the new name.

## Method

1. Rename every package and every reference in code, tests, build scripts, README, CONTRIBUTING, skills and samples; regenerate the lockfile. Historical documents under `docs/` keep the old name.
2. Core: the former scope mapped in `locate` (npm sources), in the kit resolve hook and in the `peerDependencies` check; the `renamed-package` warning in `check()`.
3. Tests: a workspace declaring `npm:@agent-workshop/adoc-plugin-todo` loads it and warns; a plugin importing `@agent-workshop/adoc-plugin-kit` loads.
4. Tell sdfj_kr that dev is ready for the first `@garage49` release (the release itself goes through the shared build).

## Done when

- [x] No `@agent-workshop` outside the transition code, its tests and historical documents.
- [x] Old names in adoc.yaml and plugin imports work and are reported by `adoc check`.
- [x] Tests, `pnpm check`, `aterm corpus check` and `adoc check` pass; `pnpm publish --dry-run` lists the nine `@garage49` packages.

## Log

- 2026-10-07: designed from [[NOTE-261007-npm-scope-garage49]] after the Owner's decision (hc #632).
- 2026-10-07: renamed all 11 packages and every reference (code, tests, build, README, CONTRIBUTING, skills, samples, THIRD_PARTY_NOTICES, lockfile); historical docs keep the old name. Transition in core (`plugins.ts`: `FORMER_SCOPE`, `currentName`, the kit resolve hook and the peerDependencies check accept the former kit name) and the `renamed-package` warning in `check()`. New test: `npm:@agent-workshop/adoc-plugin-todo` loads, a plugin importing `@agent-workshop/adoc-plugin-kit` loads, the former name in peerDependencies is checked, `adoc check` reports the source with the new name. 47 tests, `pnpm check`, `aterm corpus check`, `adoc check` pass; `publish --dry-run` lists the nine `@garage49` packages at 0.1.3. The version for the first `@garage49` release is set at release time with the shared build.
- 2026-10-07: Owner decisions (hc #635): master renamed to main (local worktree moved to ~/work/adoc/main), adoc-hub shares adoc's version line, the first @garage49 release is 0.2.0. All versions set to 0.2.0 (11 package.json, ranch-plugin Cargo.toml and herdr-plugin.toml), plugins' kit range ^0.2.0; `tooling/versions.mjs` in `pnpm check` keeps them equal. adoc-hub's own release path removed (release.sh, Dockerfile, the macOS workflow): releases go through the shared garage49 build (build.yml by sdfj_kr); fetch-or-build's default tag is v${VERSION}.
- 2026-10-07: released 0.2.0: tag v0.2.0 on main (e76a557). The first tag run (37568928907) stopped after sketch: its post-publish check gave up while npm still processed the 15.8 MB package; sdfj_kr made the shared publish re-runnable with a longer wait, and run 37570796833 published core and the CLI and completed the GitHub Release (nine tarballs, adoc-hub for linux-x86_64, macos-aarch64, macos-x86_64, .sha256 each, SHA256SUMS). Smoke test from a clean prefix and HOME passed (install, init, plugin list, check, server and web UI, old-name transition with the renamed-package warning, adoc-hub checksum and version). sdfj_kr deprecates the @agent-workshop names next.
