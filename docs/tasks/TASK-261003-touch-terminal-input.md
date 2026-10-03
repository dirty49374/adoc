---
title: Korean input to the terminal on an iPad (input line)
status: REVIEW
assignee: adoc-dev
notes: [NOTE-261003-touch-terminal-input]
---

## Goal

On an iPad, Korean typed for the agent's terminal arrives as whole syllables, not as separate letters.

## Design

Spec Terms (aterm, `spec/adoc_ui.trm`):

- `_adoc_ui:Terminal_Input_Line_` (new): the one-line native field below the terminal on a touch device; Enter sends text + Enter, Shift+Enter text + ESC CR; an Enter ending a composition does not send; with the field empty, Backspace, arrows, Escape, Tab and Ctrl+C pass through; sending takes control.
- `_adoc_ui:Terminal_Panel_`: on a touch device typed text comes only through the input line; a tap on the terminal moves the focus there.

## Method

1. `TerminalPanel.tsx`: the input line under the terminal when `navigator.maxTouchPoints > 0`; key handling as above; xterm's textarea focus redirected to the field.
2. CSS for the line in the dock's style.
3. Check in a browser with touch emulation against a scratch pane claimed by the demo workspace, Korean typed through an input method (Playwright `insertText` and composition events), Enter, Shift+Enter, the pass-through keys.

## Done when

- [x] On a touch device the input line appears below the terminal; on a desktop it does not.
- [x] Composed text reaches the pane whole; Enter during a composition does not send.
- [x] Enter, Shift+Enter, and the pass-through keys behave as specified.
- [x] Tests, `pnpm check`, `aterm corpus check` and `adoc check` pass.

## Log

- 2026-10-03: designed from [[NOTE-261003-touch-terminal-input]].
- 2026-10-03: implemented `TerminalInputLine.tsx` (shown when `navigator.maxTouchPoints > 0`) and wired it into `TerminalPanel.tsx` (xterm's textarea focus moves to the line on touch devices; sending takes control). Checked on the demo with iPad emulation (maxTouchPoints 5) against a scratch pane running `cat -v`: Enter during a composition kept the text; `한글` arrived as whole syllables (UTF-8 ED 95 9C EA B8 80) with Enter; Shift+Enter sent ESC CR; ArrowUp, Backspace and Ctrl+C passed through on the empty field; on a desktop the line is absent. Not checked on a real iPad.
