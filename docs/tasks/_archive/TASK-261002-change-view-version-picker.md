---
title: Change view over any version in memory
status: DONE
assignee: adoc-dev
notes: [NOTE-261002-note-plugin]
related: [TODO-adoc]
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
- 2026-10-02: server lists versions with the time first seen (`GET /api/documents/<KEY>/versions`).
- 2026-10-02: web UI picker next to the change toggle; spec and tests updated.
- 2026-10-02: verified in the browser: the picker lists the versions in memory and shows the line diff against the chosen one. Ready for review.
- 2026-10-02: reviewed and accepted.
