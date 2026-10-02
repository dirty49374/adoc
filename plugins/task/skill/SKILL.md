---
name: adoc-task
description: "TASK documents: detailed work orders with front matter and ## sections that go from TODO through RUNNING and REVIEW to DONE. Use when work needs a design and a plan before it is done, when finishing work for review, or when the user reviews, approves or archives tasks."
---

# TASK documents

Document keys look like `TASK-<local id>`. Read the general workflow with `adoc skill view adoc`.

## Purpose

A TASK is the work order for one piece of work that needs a design and a plan: what it achieves, how, and when it counts as done, with a log of what happened. It lets the user agree on the work before it starts and review it when it ends.

## States and workflow

`TODO` → `RUNNING` → `REVIEW` → `DONE`, then archived.

- Write the TASK and agree on it with the user before you start; it usually comes from a NOTE.
- Set `RUNNING` when you start (a step to commit, see the adoc skill), and log progress in `## Log`.
- When you finish, set `REVIEW`. **Only the user decides that a task is DONE:** when they approve it, you set `status: DONE`.
- **Keep the user told.** While any TASK has `status: REVIEW`, end every report to the user in the conversation (after finishing a piece of work, when you go idle) with one line listing those TASKs in the order of `adoc document list --plugin TASK` (the most recently changed first; pick the REVIEW ones yourself): at most three keys, then the number of the others, if any: `Tasks to review: TASK-a, TASK-b, TASK-c and 4 more`.
- **When the user says they will review:** open the first one of that order with `adoc ui open <KEY>`, say in one or two sentences what it delivered and what to look at, and wait. When they approve it, set `status: DONE`, commit, and open the next one. When they ask for changes, make them and keep the task in REVIEW. Stop when none is left or the user stops.
- **When the number of DONE TASKs (not archived) reaches 10, 20, 30, …**, ask the user whether to archive them. If they agree, archive each, and the NOTEs listed in their `notes:` unless a task that stays lists them too; run `adoc check` and commit.

## Instructions

- When a task comes from one or more NOTEs, always list them in `notes:`, so that the task can be traced back to the discussion.
- Keep `## Done when` checkable: concrete results the user can verify. Check an item when you have verified it, and log how.
- Log facts in `## Log` with dates: what changed, what was checked and how, and what was not checked.
- To split a task, create a new TASK and link both with `[[KEY]]`.
- When the user asks for a status change the work does not allow yet, such as DONE while `## Done when` items are open, keep the status, say why in your conversation, and ask whether to drop those items.

## File

`TASK-<local id>.md`: YAML front matter, then Markdown with `##` sections.

```markdown
---
title: Paginate the order list
status: RUNNING          # TODO | RUNNING | REVIEW | DONE
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

- `title` and `status` are expected; `assignee` (who works on it, such as the agent's name), `notes` and `related` are optional and appear in tooltips. `notes` and `related` are YAML lists of document keys, even for one key: `notes: [NOTE-x]`.
- Write `[[KEY]]` in the body to refer to another document.
- Recommended local id: today's date (yymmdd) and a title, such as `TASK-260930-order-paging`.

## Anchors

The anchor of a section is its heading in lowercase, with every run of other characters than letters and digits turned into one hyphen: `## Done when` is `TASK-…#done-when`.

## Actions

None of its own beyond the common `archive` and `unarchive` (see the adoc skill): the user asks for a status change in a comment or in the conversation, and you edit `status:` in the front matter.
