---
title: Paginate the order list
status: RUNNING
assignee: demo-agent
related: [TODO-gui, KANBAN-sprint12]
---

## Goal

With more than 10,000 orders the order list takes over five seconds to load.
Move to cursor-based pagination so that p95 stays under 200 ms.

## Method

1. Replace `OrderRepository.findAll()` with `findPage(cursor, limit)`.
2. Use page numbers instead of infinite scroll in the frontend; pass the cursor of the selected page.

> Question: page numbers usually mean offset paging, and jumping to an arbitrary page needs its cursor. Keep cursor paging with page numbers (cursors per visited page), or go back to offset paging? Until answered, step 2 keeps cursor paging.
3. Keep the offset API deprecated for one release.

## Done when

- p95 response under 200 ms
- No caller of the offset API remains

## Log

- 2026-10-01: step 1 done
- 2026-10-02: external edit while a comment is open
- 2026-10-02: status DONE requested, kept RUNNING: only step 1 is done, the Done when criteria are not met yet, and step 2 just changed to page numbers.
