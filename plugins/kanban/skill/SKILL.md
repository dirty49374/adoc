---
name: adoc-kanban
description: "KANBAN documents: one board of about ten cards in columns, to see where work stands. Use when the person wants an overview of work in progress, moves a card, or asks to add or remove cards."
---

# KANBAN documents

Document keys look like `KANBAN-<id>`. Read the general workflow with `adoc skill view adoc`.

## Purpose

A KANBAN board is one screen that shows where about ten pieces of work stand, so that the person sees the state of the work at a glance. It keeps no history; git does.

## States and workflow

- The columns are the states, in order, usually `TODO`, `RUNNING`, `DONE`, and the hidden `REMOVE`.
- The person drags a card to another column in the web UI; that reaches you as a request, and you move the card in the file. You also move cards yourself when the work they stand for changes state.

## Instructions

- Keep the board to about ten cards: when it grows, ask the person whether to remove DONE cards.
- Keep each card one line; refer to the document that holds the details with `[[KEY]]`.
- A board is independent: moving a card never changes the documents its text refers to, and changing those documents never moves a card. Update both only when the person asks for it.
- Give a new card the next free id; never reuse the id of a removed card.

## File

`KANBAN-<id>.yaml`:

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
- Each card has a unique short `id` (`c1`, `c2`, …), a one-line `text` (may contain `[[KEY]]`) and its `column`.
- Recommended id: a project or a team, such as `KANBAN-sprint12` or `KANBAN-adoc`.

## Anchors

The anchor of a card is its `id`: `KANBAN-sprint12#c1`.

## Actions

| action | what adoc already did | what you do |
|---|---|---|
| `move` (drag a card), message `user request: move card c1 "…": RUNNING => DONE` | nothing (`applied: false`) | set that card's `column` to the new column; for `REMOVE`, delete the card from `cards` |
