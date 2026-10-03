---
title: Recurring tasks
status: REVIEW
assignee: todoapp-dev
related: [TODO-todoapp]
---

## Goal

A todo can repeat daily, weekly or monthly; checking it creates the next one.

## Method

1. Add `repeat: none | daily | weekly | monthly` to the todo model.
2. When a repeating todo is checked, create the next occurrence with the due date moved forward.
3. Show a small ↻ icon on repeating todos.

## Done when

- [x] Checking a weekly todo creates the next one, seven days later
- [x] A monthly todo on the 31st moves to the last day of shorter months
- [x] The ↻ icon shows on repeating todos

## Log

- 2026-10-01: model and API: `repeat` field, migration for existing todos.
- 2026-10-02: next occurrence on check; month-end rule tested with 2026-01-31 → 02-28 → 03-31.
- 2026-10-02: icon added; checked in light and dark mode. Not checked: time zones other than UTC+9.
