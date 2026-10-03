---
title: Due dates with a date picker
status: DONE
assignee: todoapp-dev
related: [TODO-todoapp]
---

## Goal

Every todo can have a due date; overdue todos stand out in the list.

## Method

1. Add `dueAt` (ISO date) to the todo model and the API.
2. A date picker in the edit sheet; "Today", "Tomorrow", "Next week" shortcuts.
3. Overdue todos show their date in red.

## Done when

- [x] A due date survives a reload and a sync
- [x] Overdue todos are red in the list

## Log

- 2026-09-28: model, API and picker done; checked on iOS and Android.
