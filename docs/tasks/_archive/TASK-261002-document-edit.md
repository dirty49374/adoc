---
title: edit documents in the web UI, with the diff for the agent
status: DONE
assignee: adoc-dev
notes: [NOTE-261002-document-edit]
related: [KANBAN-adoc]
---

## Goal

The person edits the whole main file of a document in the web UI. The edit is written at once; the agent gets the unified diff with the person's next message.

## Design

Spec Terms (aterm):

- `_Document_` (`spec/adoc.trm`): the web UI changes files only through the server, by an action or by sending the edited main file.
- `_Adoc_Server_`: writes an edited main file only while its version is current, and answers with the new version and the diff since the text the unsent edits started from.
- `_Document_Editor_` (new, `spec/adoc_ui.trm`): opens from the edit button of `_Document_Header_`; saves on the button or Ctrl+S; keeps the text when refused; one edit draft per document with the diff since the first unsent edit, removed when the text is back; its own saves count as shown.

## Method

1. Plugin kit: `unifiedDiff`.
2. Core: `Workspace.editMainFile`; `POST /api/documents/:key/file`.
3. Web UI: `DocumentEditor`; one `ownWrite` path in the detail pane for actions and edits (the version they produce counts as shown); drafts generalized to one per document and origin (`element` for client modules, `edit` for the editor) with a browser-only `base`.
4. Tests and a browser check.

## Done when

- An edit saves at once, and a chip with the diff waits in the composer.
- More edits before sending widen the same diff; editing back removes it.
- An edit against a changed file is refused and the typed text stays.

## Log

- 2026-10-02: designed in aterm from [[NOTE-261002-document-edit]] and implemented as above.
- 2026-10-02: checked on a demo copy (port 7799) with a TASK document: the first save wrote the file and put "I edited docs/…: ```diff …```"; a second edit widened the same draft (title and status); editing back removed it ("the text is back to what the agent saw last"); the change view stayed off; an edit against a file changed meanwhile was refused (409) with the typed text kept. Tests: plugin-kit 11 (unifiedDiff), core 21 (edit endpoint), CLI 5.
