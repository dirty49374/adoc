---
title: Message format with the person's text first
status: REVIEW
assignee: adoc-dev
related: [TASK-261002-herdr-integration]
---

## Goal

A pushed message should read like a chat message: the header says it came from adoc, the text typed in the composer comes first, and the drafts and machine fields follow as attachments after `--`.

## Design

- `_User_Comment_Message_`: composer text with its target, plus draft `_User_Comment_` entries.
- `_User_Message_Format_`: `[adoc message N] <kind> · <target>`, main text, `--`, YAML attachments; the same shape for actions.
- `_Comment_Composer_`: sends its text as the composer text.

## Method

1. core: message model and formatter; server request schema (`target`, `text`, `comments`).
2. web UI: composer request, pending message rows.
3. Guide and tests.

## Done when

- A message sent from the web UI arrives in the agent pane in the new shape.
- Tests, `pnpm check` and `aterm corpus check` pass.

## Log

- 2026-10-02: requested by the person in a comment on [[TASK-261002-herdr-integration]]; spec changed first.
- 2026-10-02: implemented in core (model, formatter, request schema), web UI (composer, pending rows), guide and tests; server restarted. Waiting for a message from the web UI to confirm the shape.
