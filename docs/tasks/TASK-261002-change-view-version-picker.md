---
title: Change view over any version in memory
status: RUNNING
assignee: adoc-dev
related: [NOTE-261002-note-plugin, TODO-adoc]
---

## Goal

The change view compares only with the version this browser showed last. The person also wants to compare with any older version that the server still keeps in memory.

## Method

1. Server: list the versions of a document in the _Document_Version_Store_ with the time each was first seen (`GET /api/documents/<KEY>/versions`).
2. Web UI: next to the _Change_Toggle_, a version picker; the default base stays "the version this browser showed last".
3. Choosing a version re-renders the changes against it, with renderChanges or the line diff.
4. Spec: extend _Document_Version_Store_ and _Change_Toggle_; tests for the versions route.

## Done when

- The picker lists every version in memory, newest first, with its time.
- Picking a version shows the changes since it; the toggle still turns the changes off.
- Tests, `pnpm check` and `aterm corpus check` pass.

## Log

- 2026-10-02: created from [[NOTE-261002-note-plugin]].
