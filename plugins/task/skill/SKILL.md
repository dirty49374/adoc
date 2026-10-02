---
name: adoc-task
description: "TASK documents: A detailed work order: front matter with title and status, and ## sections."
---

# TASK documents

Document keys look like `TASK-<id>`. Read the general workflow with `adoc skill view adoc`.

A TASK document is a detailed work order for one piece of work.

## File

`TASK-<id>.md`: YAML front matter, then Markdown with `##` sections.

```markdown
---
title: Paginate the order list
status: RUNNING
assignee: adoc-dev
notes: [NOTE-260929-order-list-speed]
related: [TODO-gui]
---

## Goal

Order list loads in under 200 ms with 10k orders.

## Method

1. Replace `findAll()` with `findPage(cursor, limit)`.

## Done when

- [ ] p95 under 200 ms
```

- `title` and `status` are required in spirit; `status` is free text, usually TODO, RUNNING, REVIEW or DONE.
- `notes` (the NOTE keys the task came from), `assignee` and `related` (other document keys) are optional and appear in tooltips.
- When a task comes from one or more NOTEs, always list them in `notes`, so that the task can be traced back to the discussion.
- Write `[[KEY]]` in the body to refer to another document.
- Recommended id: date and title, such as `TASK-260930-order-paging`.

## Anchors

The anchor of a section is its heading in lowercase with hyphens: `## Done when` is `TASK-…#done-when`.
A comment also carries `source: <file>:<line>` for the exact line and a `quote` of the selected text.

## Actions

None: the person changes a status by telling you, and you edit `status:` in the front matter.

## Review: keep the person told

When you finish a task, set `status: REVIEW`; only the person moves it to DONE.

- **Keep reminding.** Whenever you report to the person in the conversation (after finishing a piece of work, when you go idle), and while any TASK is in REVIEW, end with one line listing them, newest first, at most three keys and then a count:
  `Tasks to review: TASK-a, TASK-b, TASK-c and 4 more`
  Find them with `adoc document list --plugin TASK` (status REVIEW).
- **When the person says they will review:** open the first one with `adoc ui open <KEY>`, say in one or two sentences what it delivered and what to look at, and wait. When the person says done (or "ok", "완료"), set `status: DONE`, commit, and open the next one. When they ask for changes, do them in that task and keep it in REVIEW. Stop when none is left or the person stops.
- **Too many DONE tasks:** when ten or more TASKs are DONE (not archived), ask the person once whether to archive them. If they agree, move each with `git mv` into `_archive/` next to it (`docs/tasks/_archive/TASK-x.md`), run `adoc check`, and commit. Archived tasks keep their keys and references.

## Typical requests

- A comment with a quote on a section: change that text in that section.
- "split this task": create a new `TASK-<id>.md` and link both with `[[KEY]]`.
