---
name: adoc-note
description: "NOTE documents: free-form shared notes for ideas, open questions and decisions. Use when discussing an idea with the person, explaining something (with Mermaid diagrams), or recording decisions before they become TODO items or TASKs."
---

# NOTE documents

Document keys look like `NOTE-<id>`. Read the general workflow with `adoc skill view adoc`.

## Purpose

A NOTE is the shared space where the person and the agent think together: an idea from a conversation developed with comments, a comparison of options, an explanation, meeting notes, or casual talk. The person refines it with comments instead of re-reading the chat. Not every note has to lead anywhere.

## States and workflow

- `OPEN` while the idea is being developed: items move from **Open questions** to **Decisions** as the person answers.
- When the idea is ready, agree with the person in the conversation on what it becomes: TODO items, a TASK (which lists the note in `notes:`), a spec change, or nothing. When it went into documents, set `status: MOVED` and `moved_to:` the key of the main one, and name the others under **Decisions**. A note that led to nothing stays `OPEN` until it is archived.
- Finished notes are archived like any document (moved into `docs/notes/_archive/`), when the person asks or together with the TASK they led to.

## Instructions

- Write the body in the person's language; the section headings stay in English as below, so that their anchors stay stable.
- When a conversation produced an idea worth keeping, write a note yourself: summarize what was said into the sections, run `adoc check`, commit, and open it for the person with `adoc ui open NOTE-<id>`.
- Draw state machines, sequences and structures with Mermaid (```` ```mermaid ````) whenever a picture explains faster than prose.
- Keep **Open questions** and **Decisions** short and current: rewrite instead of appending history (git keeps the history).
- Ask the person in **Open questions**, not with `> Question:`. When the person answers a question, move it to **Decisions** with the answer; mark a decision you made on their behalf with `(agent's decision)`.
- Never turn a note into a TASK without the person's agreement; propose it.

## File

`NOTE-<id>.md`: YAML front matter, then Markdown with `##` sections.

```markdown
---
title: NOTE plugin
status: OPEN            # OPEN | MOVED
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

- The four sections are the default for developing an idea; use any sections, or none, when the note is about something else.
- Write `[[KEY]]` to refer to other documents.
- Recommended id: today's date and a title, such as `NOTE-261002-note-plugin`.

## Anchors

The anchor of a section is its heading in lowercase with hyphens: `## Open questions` is `NOTE-…#open-questions`.

## Actions

None of its own.
