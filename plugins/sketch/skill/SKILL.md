---
name: adoc-sketch
description: "SKETCH documents: drawings, such as UI wireframes, that the person draws in Excalidraw; read the PNG and the Excalidraw JSON."
---

# SKETCH documents

Document keys look like `SKETCH-<id>`. Read the general workflow with `adoc skill view adoc`.

A SKETCH document is a drawing the person makes in the web UI, usually a UI wireframe or a diagram that is easier to draw than to describe.

## Files

- `SKETCH-<id>.excalidraw`: the drawing as Excalidraw JSON (`"type": "excalidraw"`, `elements`, `appState`, `files`). Every shape is an element with `type` (`rectangle`, `ellipse`, `arrow`, `line`, `text`, …), position `x`, `y`, size `width`, `height`, and for text `text`. Arrows may bind to shapes (`startBinding`, `endBinding`).
- `SKETCH-<id>.png`: the same drawing as an image, written by the web UI on every save. It is a companion file of the document.
- Recommended id: date and topic, such as `SKETCH-261002-login-screen`.

## When the person sends a sketch

The person's message carries a comment such as "The sketch SKETCH-x changed: docs/…/SKETCH-x.png (image) and docs/…/SKETCH-x.excalidraw (Excalidraw JSON)". Read **both**: look at the PNG to see the layout, and read the JSON for exact texts, the shapes and how they connect. Then do what the message asks, for example write the screen into a NOTE or a spec.

## New sketch

To give the person an empty board, create `SKETCH-<id>.excalidraw` with:

```json
{ "type": "excalidraw", "version": 2, "source": "adoc", "elements": [], "appState": {}, "files": {} }
```

Then open it for the person with `adoc ui open SKETCH-<id>`.

## Editing a sketch yourself

You may edit the JSON, for example to tidy a wireframe or add labels; keep `"type": "excalidraw"` and give every new element a unique `id`, `version: 1` and `versionNonce`. The open board picks up your change. The PNG is written only by the web UI, so it shows your change after the person's next save.

## Anchors

None: comment on the whole document.

## Actions

| action | what adoc already did | what you do |
|---|---|---|
| `save` | wrote the JSON and the PNG (`applied: true`, no message of its own) | nothing; the change reaches you as the person's comment with the next message |
