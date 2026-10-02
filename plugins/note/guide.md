A NOTE is a working note: it captures an idea from a conversation and develops it until it is ready to become something else.

## What notes are for

- Summarizing a design conversation so the person can refine it with comments instead of re-reading the chat.
- Comparing options, collecting open questions, recording decisions as they are made.
- When the open questions are gone, agree with the person on what the note becomes: usually a TASK, sometimes a proposal or spec change, or just an archived record. That choice is yours to propose; adoc has no dedicated conversion feature.

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
- The four sections are the default template; add or rename sections when the topic needs it.
- Developing a note means moving items from **Open questions** to **Decisions**. Keep both lists short and current; rewrite instead of appending history (git keeps history).
- Write `[[KEY]]` to refer to other documents.

## When you create a note from a conversation

Summarize what was said into the sections, write it, run `adoc check`, commit, then show it to the person with `adoc ui open NOTE-<id>`.

## Anchors

The anchor of a section is its heading in lowercase with hyphens: `## Open questions` is `NOTE-…#open-questions`.

## Actions

| action | what adoc already did | what you do |
|---|---|---|
| `convert` (value `TASK`) | nothing (`applied: false`) | create a `TASK-<id>.md` from the note's decisions, set the note's `status: MOVED` and `moved_to: <TASK key>`, then `adoc ui open` the new task |
| `archive` (value `ARCHIVED`) | nothing | set `status: ARCHIVED` |
