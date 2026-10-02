---
name: adoc-kanban
description: "KANBAN documents: One screen of about ten cards in columns, to see where work stands."
---

# KANBAN documents

Document keys look like `KANBAN-<id>`. Read the general workflow with `adoc skill view adoc`.

A KANBAN document is one screen showing where about ten pieces of work stand. It keeps no history.

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

- `columns` is the column order. A column named `REMOVE` is not shown; it is a drop target for removal.
- Each card has a unique short `id` (`c1`, `c2`, …), a one-line `text` (may contain `[[KEY]]`) and its `column`.
- Recommended id: a project or person, such as `KANBAN-sprint12` or `KANBAN-adoc`.

## Anchors

The anchor of a card is its `id`: `KANBAN-sprint12#c1`.

## Actions

| action | what adoc already did | what you do |
|---|---|---|
| `move` (drag a card), message `user request: move card c1 "…": RUNNING => DONE` | nothing (`applied: false`) | set that card's `column` to the new column; for `REMOVE`, delete the card from `cards` |

## Typical requests

- A comment on a card: change its text, or add a new card with the next free id.
- A board is independent: moving a card never changes the documents its text refers to, and changing those documents never moves a card.
