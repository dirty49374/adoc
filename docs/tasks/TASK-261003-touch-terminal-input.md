---
title: The web UI on touch devices (iPad, phone): composer band, list pane, app-like page
status: REVIEW
assignee: adoc-dev
notes: [NOTE-261003-touch-terminal-input]
---

## Goal

On an iPad, the person types Korean for the agent in the message composer, which is a full-width band at the bottom of the page, opposite the top bar, never covering the content.

## Design

Spec Terms (aterm, `spec/adoc_ui.trm`):

- `_adoc_ui:Comment_Composer_`: on a pointer device it floats over the bottom of the main area as before; on a touch device it is a full-width band at the bottom of the _App_Shell_, symmetric to the top bar, laid out below the main area and the _Message_Dock_ (no overlay) and never folded.
- `_adoc_ui:App_Shell_`: places the composer by the device.

## Method

1. Revert the terminal input line (6574ff5).
2. `device.ts`: `TOUCH` (`navigator.maxTouchPoints > 0`), the one place that tells a touch device.
3. `AppShell.tsx`: on a touch device the composer goes below `shell-body`, as wide as the page; `CommentComposer` gets `docked`: always open, no pin, publishes no room for the main area.
4. CSS for the docked band.
5. Check with iPad emulation and on a desktop.

## Done when

- [x] On a touch device the composer is a full-width band at the bottom, below the main area and the dock, never folded, covering nothing.
- [x] On a desktop the composer floats as before.
- [x] Tests, `pnpm check`, `aterm corpus check` and `adoc check` pass.

## Log

- 2026-10-03: first a terminal input line (6574ff5); the Owner chose the composer instead (comment on the NOTE); redesigned.
- 2026-10-03: implemented: `device.ts` (`TOUCH`), the composer below `shell-body` on a touch device with `docked` (always open, no pin, no room published), CSS for the band. Checked with iPad emulation (1180×820, touch): top bar, main area and dock, then the composer band across the full width, no overlap, no pin; on a desktop the composer floats as before. Not checked on a real iPad.
- 2026-10-03: the Owner asked (workspace comment) that choosing a document on an iPad closes the list pane: on a touch device a rail tap holds the list open and a chosen document folds it (`dismissed` in the pin-and-fold mechanism, overriding the hover iOS leaves behind a tap). And (message) no rubber-banding on iPad and phones: the page never scrolls, `overscroll-behavior: none` everywhere, `touch-action: manipulation`, `#root` 100dvh. Spec: _Document_List_Pane_, _App_Shell_. Checked with touch emulation: rail tap 32→280 px, row tap → 32 px and the document opens, stays folded under a hover, rail tap reopens; desktop unchanged (stays open while hovered); page not scrollable, overscroll none. Found that `pnpm -s check` hides tsc errors; checks now run without -s.
