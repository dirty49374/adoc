---
name: adoc-kanban
description: "KANBAN documents: one board of about ten cards in columns, to see where work stands. Use when the person wants an overview of work in progress, moves a card, or asks to add or remove cards."
---

# KANBAN documents

Document keys look like `KANBAN-<local id>`. Read the general workflow with `adoc skill view adoc`.

## Purpose

A KANBAN board is one screen that shows where about ten pieces of work stand, so that the person sees the state of the work at a glance. It keeps no history; git does.

## States and workflow

- The columns are the states, in the order of `columns`, usually `TODO`, `RUNNING` and `DONE`. A column named `REMOVE` is not a state but a hidden drop target: a card dropped there is to be deleted, never left in it.
- The person drags a card to another column in the web UI; that reaches you as a request, and you move the card in the file. Move or remove a card only when the person asks for it or agrees.

## Instructions

- Keep the board to about ten cards: when it has more, ask the person whether to remove DONE cards.
- Keep each card one line; refer to the document that holds the details with `[[KEY]]`.
- Ask the person in your conversation, not in the file: the view shows only the cards.
- A board is independent: moving a card never changes the documents its text refers to, and changing those documents never moves a card. Update both only when the person asks for it.
- Give a new card an id one higher than any id the board has had; never reuse the id of a removed card (look at the board's git history when the highest card was removed).

## File

`KANBAN-<local id>.yaml`:

```yaml
title: Sprint 12
columns: [TODO, RUNNING, DONE, REMOVE]
cards:
  - id: c1
    text: Paginate the order list [[TASK-260930-order-paging]]
    column: RUNNING
  - id: c2
    text: Dark mode
    column: DONE
```

- `columns` is the column order. A column named `REMOVE` is not shown; dropping a card on it asks for its removal.
- Each card has a unique short `id` (`c1`, `c2`, …), a one-line `text` (may contain `[[KEY]]`) and its `column`, which must be one of `columns`; a card in another column is not shown.
- Recommended local id: a topic, such as a project or a team: `KANBAN-adoc`, `KANBAN-sprint12`.

## Anchors

The anchor of a card is its `id`: `KANBAN-sprint12#c1`.

## Actions

| action | what adoc already did | what you do |
|---|---|---|
| `move` (drag a card), message `user request: move card c1 "…": RUNNING => DONE` | nothing (`applied: false`); no message when the card is already in that column | set that card's `column` to the new column; for `REMOVE`, delete the card from `cards` |
