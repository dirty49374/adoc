---
title: UI polish with the opencode theme
status: REVIEW
assignee: adoc-dev
notes: [NOTE-261002-ui-polish]
related: [KANBAN-adoc]
---

## Goal

The web UI takes the frame and the colours of the opencode TUI theme "opencode": surfaces instead of borders, accent bars for emphasis, base-size headings coloured by role, Markdown and syntax colours, light and dark variants. It adds what a web page does better: vector icons, smaller meta text, chips, and a plugin CSS of tokens and classes.

## Design

Spec Terms (aterm):

- `_Web_UI_Theme_` (`spec/adoc.trm`): `--adoc-*` design tokens with the opencode values, three surface levels, accent bar, type scale (largest = base), system scheme with a choice, bundled fonts, vector icons, generic `adoc-*` classes.
- `_Plugin_Kit_`: Markdown marks fenced code with `hljs-*` syntax classes; the authoring guide lists the tokens and classes; `styled by _Web_UI_Theme_`.
- UI (`spec/adoc_ui.trm`): `_Theme_Toggle_` (new); `_Message_Dock_` one header with agent, pane, status, control state and pending chip; `_Terminal_Panel_` reports its state to that header; `_Comment_Composer_` starts as one line and grows; `_Document_List_Pane_` folds into a rail while a document is shown.

## Method

1. **Fonts and icons**: Pretendard Variable, D2Coding (regular, bold) and Symbols Nerd Font Mono as woff2 in `packages/webapp/public/fonts/` with their licences; `lucide-react`.
2. **Tokens**: `app.css` rewritten on `--adoc-*` tokens, dark and light, `data-theme` on `<html>` from the `_Theme_Toggle_`; no colour literal outside the token block.
3. **Components**: tab bar, list rail, document header (small key, title, status as coloured text), body with reading width, anchors with panel surface and accent bar, popovers and cards on panel surface, dock with one header, growing composer with icon send, chips everywhere badge was used (`adoc-badge` → `adoc-chip`).
4. **Terminal**: xterm theme and ANSI palette from the tokens, D2Coding + Nerd symbols font, re-themed on scheme change.
5. **Plugin CSS**: Markdown colours, `hljs-*` syntax colours (highlight.js in plugin-kit), generic classes restyled; authoring guide section updated.
6. **Checks**: browser screenshots in dark and light (home, TODO, TASK, KANBAN, NOTE with changes, terminal), tests, `pnpm check`, `aterm corpus check`.

## Done when

- Every colour in the web UI comes from a `--adoc-*` token; dark and light follow the system and the toggle.
- No text is larger than the body text; Korean text and the terminal's Powerline symbols render with the bundled fonts.
- The plugin authoring guide lists the tokens and classes, and the four plugins use only them.
- Tests, `pnpm check` and `aterm corpus check` pass.

## Log

- 2026-10-02: designed in aterm from [[NOTE-261002-ui-polish]].
- 2026-10-02: fonts bundled (Pretendard from npm at build time; D2Coding and Symbols Nerd Font Mono converted to woff2, with licences); Lucide icons.
- 2026-10-02: `app.css` rewritten on `--adoc-*` tokens written `light-dark(light, dark)`, so the system scheme needs no JavaScript and the `_Theme_Toggle_` only sets `color-scheme`; the shared primitives `adoc-chip`, `adoc-block`, `adoc-tone-*` are used by the web UI and plugins alike (`adoc-badge` → `adoc-chip`).
- 2026-10-02: components: tabs moved into the top bar, list folds into a rail with pin, header with small key and coloured status, 860px reading column, dock with one header (terminal phase and pending chip), one-line growing composer with icon send, xterm theme from the tokens.
- 2026-10-02: plugin-kit Markdown highlights fenced code (highlight.js `hljs-*`); authoring guide section "Styling: classes and design tokens".
- 2026-10-02: fixed on the way: the server served only four hard-coded files and returned index.html for the fonts. Built files now live under `/assets/` and every other non-API path is a client route (a document key may contain a dot, so an extension test would be wrong). Test added.
- 2026-10-02: checked in the browser (demo, dark and light: TASK list and detail, KANBAN, TODO with rail and comment popover). Tests 30 passing, `pnpm check` and `aterm corpus check` clean. Not checked by me: the terminal panel on a claimed pane (taking control from a test browser would resize the person's pane).
- 2026-10-02: square corners everywhere: the person saw the accent bars bend with the 2px rounded corners; `--adoc-radius` removed, spec rule added.
- 2026-10-02: the composer and the draft chips moved from the _Message_Dock_ to below the main area of the _App_Shell_ (the person could not tell them from the terminal); the composer starts with three lines. Spec: _App_Shell_, _Comment_Composer_, _Draft_Chip_List_, _Message_Dock_.
