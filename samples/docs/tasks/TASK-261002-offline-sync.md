---
title: Offline sync for the mobile app
status: RUNNING
assignee: todoapp-dev
notes: [NOTE-261001-offline-sync]
related: [TODO-todoapp, KANBAN-todoapp]
---

## Goal

Adding, editing and checking todos work without a network; changes sync when it returns.

## Method

1. A change queue in IndexedDB, written before the UI updates.
2. A sync worker replays the queue in order when the app comes online.
3. The server answers `409` for a stale `version`; the client merges field by field. When both sides changed the same field, the newest edit wins, and a small "merged" toast tells the user.
4. An "offline · N changes waiting" badge in the header.

## Done when

- [ ] A todo added in airplane mode appears on another device after reconnecting
- [ ] Two offline edits of different fields both survive
- [ ] The badge counts the waiting changes
- [ ] Two offline edits of the same field keep the newest one and show the "merged" toast

## Log

- 2026-10-02: queue and worker done; merge rule waits for the open question in [[NOTE-261001-offline-sync]].
- 2026-10-02: merge rule decided in [[NOTE-261001-offline-sync]]: newest edit per field, with a "merged" toast.
