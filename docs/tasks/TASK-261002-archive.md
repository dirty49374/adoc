---
title: archive by _archive folders
status: DOING
assignee: adoc-dev
notes: [NOTE-261002-archive]
related: [KANBAN-adoc]
---

## Goal

A document inside an `_archive` folder of a watch path is archived: it keeps its key and its references resolve, but it leaves the list pane, the tab counts and the agent's document search unless asked for.

## Design

Spec Terms (aterm):

- `_Document_Archive_` (new, `spec/adoc.trm`): `_archive` folders at any depth; keys kept; the not archived document wins a duplicate key; tab counts leave archived out; the agent moves files with `git mv`; requests arrive as the actions `archive` / `unarchive` through the default action handler.
- `_Document_Find_Command_` (new): `adoc document list` and `adoc document search <text>`, `--plugin`, `--archived` (only archived).
- `_Document_Summary_List_`: entries say whether the document is archived.
- UI: `_Document_List_Pane_` archive button in the title row; `_Document_Header_` archived mark and archive/unarchive button; `_Reference_Tooltip_` archived mark.

## Method

1. Core: scan marks records under `_archive`; duplicate keys prefer the not archived one; `archived` on summary entries, document views and reference resolution; plugin counts without archived.
2. CLI: `document list`, `document search` with `--plugin` and `--archived`; guide section on archiving and finding documents.
3. Web UI: list pane archive toggle, header mark and button (actions `archive` / `unarchive`), tooltip mark.
4. Tests (core scan and CLI), browser check on a demo copy, `pnpm check`, `aterm corpus check`.

## Done when

- Moving a document into `_archive` hides it from the list pane and the tab count, shows it under the archive button, and keeps its references working.
- `adoc document list` / `search` leave archived documents out, and show only them with `--archived`.
- The header's archive button sends the agent a request.

## Log

- 2026-10-02: designed in aterm from [[NOTE-261002-archive]].
