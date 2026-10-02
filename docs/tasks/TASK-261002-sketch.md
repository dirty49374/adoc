---
title: plugin client modules and the SKETCH plugin
status: DOING
assignee: adoc-dev
notes: [NOTE-261002-client-plugins]
related: [KANBAN-adoc]
---

## Goal

A plugin can ship browser code: a `client/` folder whose custom elements its render output uses. The first one is SKETCH: the person draws a UI in Excalidraw, and the agent gets the drawing as a PNG and its Excalidraw JSON with the next message.

## Design

Spec Terms (aterm):

- `_Plugin_Client_Module_` (new, `spec/adoc.trm`): `client/index.js` (+ `index.css`) served at `/assets/plugins/<KEY>/`, loaded once by the web UI; elements write through `adoc-action`, put one draft through `adoc-draft`, read `/api/documents/<key>/file`, follow `adoc-documents-changed`.
- `_Document_`, `_Plugin_Interface_`: companion files (`companions: ['.png']`), not handed to plugin functions; action results may return companion contents and `{ base64 }` contents.
- `_Document_Body_` (UI): forwards the element events.

## Method

1. Core: companions in scan, version and last update; binary and companion writes; `/api/documents/:key/file`; serve `client/`; plugin info says which plugins have a client; the applied action returns the new version; larger request bodies.
2. Plugin kit: `companions` in the layout schema; action result schema; authoring skill section on client modules.
3. Web UI: load client modules; forward `adoc-action` (with reply) and `adoc-draft` (replace by document); dispatch `adoc-documents-changed`; take the version from an applied action.
4. SKETCH plugin (`plugins/sketch`, its own package): `index.ts` (`.excalidraw` + `.png`), skill, `web/` source bundled into `client/` with Excalidraw and its fonts; registered in this repository.
5. Browser check on a demo copy; tests; checks.

## Done when

- Drawing in a SKETCH document saves `SKETCH-<id>.excalidraw` and `SKETCH-<id>.png`, and a chip "the sketch changed" waits in the composer.
- Sending a message carries the chip's text with both paths; the agent can read the PNG.
- An agent edit of the JSON shows up in the open drawing.

## Log

- 2026-10-02: designed in aterm from [[NOTE-261002-client-plugins]].
