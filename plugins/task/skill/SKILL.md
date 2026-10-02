---
name: adoc-task
description: "TASK documents: detailed work orders with front matter and ## sections that go from TODO to REVIEW to DONE. Use when work needs a design and a plan before it is done, when finishing work for review, or when the person reviews, approves or archives tasks."
---

# TASK documents

Document keys look like `TASK-<id>`. Read the general workflow with `adoc skill view adoc`.

## Purpose

A TASK is the work order for one piece of work that needs a design and a plan: what it achieves, how, and when it counts as done, with a log of what happened. It lets the person agree on the work before it starts and review it when it ends.

## States and workflow

`TODO` → `RUNNING` → `REVIEW` → `DONE`, then archived.

- Write the TASK and agree on it with the person before you start; it usually comes from a NOTE.
- Set `RUNNING` and commit when you start, and log progress in `## Log`.
- When you finish, set `REVIEW`. **Only the person decides that a task is DONE:** when they approve it, you set `status: DONE`.
- **Keep the person told.** Whenever you report to the person in the conversation (after finishing a piece of work, when you go idle), and while any TASK is in REVIEW, end with one line listing them in the order of `adoc document list --plugin TASK` (the most recently changed first): at most three keys, then the number of the others, if any: `Tasks to review: TASK-a, TASK-b, TASK-c and 4 more`.
- **When the person says they will review:** open the first one of that order with `adoc ui open <KEY>`, say in one or two sentences what it delivered and what to look at, and wait. When they approve it, set `status: DONE`, commit, and open the next one. When they ask for changes, make them and keep the task in REVIEW. Stop when none is left or the person stops.
- **When ten or more TASKs are DONE** (not archived), ask the person whether to archive them; when they decline, ask again only after ten more. If they agree, archive each, and the NOTEs listed in their `notes:` unless a task that stays lists them too; run `adoc check` and commit.

## Instructions

- When a task comes from one or more NOTEs, always list them in `notes:`, so that the task can be traced back to the discussion.
- Keep `## Done when` checkable: concrete results the person can verify.
- Log facts in `## Log` with dates: what changed, what was checked and how, and what was not checked.
- To split a task, create a new TASK and link both with `[[KEY]]`.
- When the person asks for a status change the work does not allow yet, such as DONE while `## Done when` items are open, keep the status and say why in your conversation.

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

## Log

- 2026-09-30: step 1 done.
```

- `title` and `status` are expected; `notes`, `assignee` and `related` (document keys) are optional and appear in tooltips.
- Write `[[KEY]]` in the body to refer to another document.
- Recommended id: date and title, such as `TASK-260930-order-paging`.

## Anchors

The anchor of a section is its heading in lowercase with hyphens: `## Done when` is `TASK-…#done-when`.

## Actions

None of its own: the person asks for a status change in a comment or in the conversation, and you edit `status:` in the front matter.
