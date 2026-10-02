---
title: skills through the skills CLI, plugin directories, skill check
status: DOING
assignee: adoc-dev
notes: [NOTE-261002-installation]
related: [KANBAN-adoc]
---

## Goal

adoc installs its agent skills the way current tools do: every skill is a `skill/SKILL.md` folder next to its owner's code, installed for every agent by the Vercel `skills` CLI, and checked on every use. Plugins can live in a project or a user plugin directory and bring their own dependencies. Publishing the npm package waits for its name.

## Design

Spec Terms (aterm, `spec/adoc.trm`):

- `_Agent_Skill_` (new): `skill/SKILL.md` of the core package (`adoc`), the plugin kit (`adoc-plugin-authoring`) and each plugin.
- `_Plugin_Skill_` (renamed from `_Plugin_Agent_Guide_`): `skill/SKILL.md` next to the plugin's `index.ts`; required. The `guide` field of `definePlugin` goes away.
- `_Skill_Install_Command_` (new): `adoc skill install | update | uninstall` run `skills add | remove`; core and kit skills in user scope, plugin skills in the plugin's scope; `--agent`; `ADOC_SKILLS_CLI`.
- `_Skill_Check_` (new): missing or outdated skills, as warnings on every CLI/MCP command, in `adoc check`, at server start.
- `_Plugin_Directory_` (new): `.adoc/plugins/` and `$XDG_CONFIG_HOME/adoc/plugins/`; bare names; scope; own `package.json`; `@adoc/plugin-kit` resolved to the running adoc.

## Method

1. Move every guide to `skill/SKILL.md` (core, plugin-kit, the four plugins) with front matter; drop `guide` from `definePlugin`.
2. Core: plugin loader with plugin directories, scope, skill discovery, `@adoc/plugin-kit` resolve hook; skills module on the `skills` CLI; skill check.
3. CLI: skill commands on the new module; every command shows skill check warnings (stderr; in the MCP result).
4. Tests with a fake `skills` CLI and a temporary home; docs (README, authoring skill).

## Done when

- `adoc skill install` runs `skills add` for each skill folder in its scope, and nothing copies plugin code.
- A missing or changed skill shows a warning on any command.
- A plugin under `~/.config/adoc/plugins/<name>` declared as `from: <name>` loads and imports `@adoc/plugin-kit`.
- Tests, `pnpm check`, `aterm corpus check` pass.

## Log

- 2026-10-02: designed in aterm from [[NOTE-261002-installation]]; `_Plugin_Agent_Guide_` renamed to `_Plugin_Skill_`.
