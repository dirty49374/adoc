---
name: adoc-note
description: "NOTE documents: A free-form shared note: ideas from a conversation, open questions, decisions, or anything the two of you want to keep."
---

# NOTE documents

Document keys look like `NOTE-<id>`. Read the general workflow with `adoc skill view adoc`.

A NOTE is a free-form shared space for the person and the agent: an idea taken from a conversation and developed with comments, a comparison, meeting notes, or just banter. It has no fixed destination.

## What notes are for

- Summarizing a design conversation so the person can refine it with comments instead of re-reading the chat.
- Comparing options, collecting open questions, recording decisions as they are made.
- Anything else worth keeping, including casual talk; not every note has to lead anywhere.
- When an idea is ready, agree with the person in conversation on what it becomes: a TASK, a proposal or spec change, or an archived record. There is no conversion button; propose it yourself.

## File

`NOTE-<id>.md`: YAML front matter, then Markdown with `##` sections.

```markdown
---
title: NOTE plugin
status: OPEN            # OPEN | MOVED | ARCHIVED
moved_to: TASK-261003-note-plugin   # only when MOVED
---

## Background

Why this came up.

## Ideas

- …

## Open questions

- …

## Decisions

- …
```

- Recommended id: today's date and a title, such as `NOTE-261002-note-plugin`.
- The four sections are the default template for developing an idea; use any sections, or none, when the note is about something else.
- Developing a note means moving items from **Open questions** to **Decisions**. Keep both lists short and current; rewrite instead of appending history (git keeps history).
- Write `[[KEY]]` to refer to other documents.

## When you create a note from a conversation

Summarize what was said into the sections, write it, run `adoc check`, commit, then show it to the person with `adoc ui open NOTE-<id>`.

## Anchors

The anchor of a section is its heading in lowercase with hyphens: `## Open questions` is `NOTE-…#open-questions`.

## Actions

| action | what adoc already did | what you do |
|---|---|---|
| `archive` (value `ARCHIVED`) | nothing | set `status: ARCHIVED` |
