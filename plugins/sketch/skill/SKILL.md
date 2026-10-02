---
name: adoc-sketch
description: "SKETCH documents: drawings, such as UI wireframes, that the person draws in Excalidraw, saved as JSON with a PNG beside it. Use when a message carries a comment that a sketch changed, when the person wants to draw something, or when a drawing must be read or tidied."
---

# SKETCH documents

Document keys look like `SKETCH-<id>`. Read the general workflow with `adoc skill view adoc`.

## Purpose

A SKETCH is a drawing the person makes in the web UI, usually a UI wireframe or a diagram that is easier to draw than to describe. It shows the agent what the person means, so that the agent can turn it into a NOTE, a spec or code.

## States and workflow

- A sketch has no states. The person draws, and every change is saved at once.
- A save sends no message; it puts one draft comment on the sketch into the composer: `The sketch SKETCH-<id> changed: <png path> (image) and <json path> (Excalidraw JSON).` It reaches you as an attached comment of the next message the person sends. Then read the sketch and do what the message asks.
- You may offer the person an empty board when a drawing would help the conversation.

## Instructions

- Read **both** files of a changed sketch: look at the PNG to see the layout, and read the JSON for the exact texts, the shapes and how they connect. If you cannot view images, work from the JSON and say so.
- Describe back in one or two sentences what you understood from the drawing before you act on it, when it is not obvious.
- You may edit the JSON, for example to tidy a wireframe or add labels. Read it just before you edit it, since the person may be drawing; the open board picks up your change. The board does not fill in missing fields, so write every new element in full: copy an element of the same type, or use the example below, and give it a new unique `id`, `seed` and `versionNonce` (random integers) and `version: 1`.
- Never write the PNG yourself: the web UI writes it on the person's next save, so after your own edit it shows the older drawing until then. Commit as usual and tell the person.
- To give the person an empty board, create `SKETCH-<id>.excalidraw` with the empty board below and open it for them with `adoc ui open SKETCH-<id>`.

## File

- `SKETCH-<id>.excalidraw`: the drawing as Excalidraw JSON (`"type": "excalidraw"`, `elements`, `appState`, `files`). Every shape is an element with `type` (`rectangle`, `ellipse`, `arrow`, `line`, `text`, …), position `x`, `y`, size `width`, `height`, and for text `text`. Arrows may bind to shapes (`startBinding`, `endBinding`).
- `SKETCH-<id>.png`: the same drawing as an image, a companion file written by the web UI on every save. A new board has none until the person's first save.
- An empty board:

```json
{ "type": "excalidraw", "version": 2, "source": "adoc", "elements": [], "appState": {}, "files": {} }
```

- A box with a label: a `rectangle` and a `text` bound to it through `boundElements` and `containerId`:

```json
{ "id": "box1", "type": "rectangle", "x": 100, "y": 100, "width": 200, "height": 80, "angle": 0,
  "strokeColor": "#1e1e1e", "backgroundColor": "transparent", "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
  "roughness": 1, "opacity": 100, "groupIds": [], "frameId": null, "roundness": null, "seed": 1468, "version": 1,
  "versionNonce": 9134, "isDeleted": false, "boundElements": [{ "type": "text", "id": "box1-label" }], "updated": 1, "link": null, "locked": false },
{ "id": "box1-label", "type": "text", "x": 150, "y": 128, "width": 100, "height": 25, "angle": 0,
  "strokeColor": "#1e1e1e", "backgroundColor": "transparent", "fillStyle": "solid", "strokeWidth": 2, "strokeStyle": "solid",
  "roughness": 1, "opacity": 100, "groupIds": [], "frameId": null, "roundness": null, "seed": 2201, "version": 1,
  "versionNonce": 5521, "isDeleted": false, "boundElements": null, "updated": 1, "link": null, "locked": false,
  "text": "Login", "originalText": "Login", "fontSize": 20, "fontFamily": 5, "textAlign": "center", "verticalAlign": "middle",
  "containerId": "box1", "autoResize": true, "lineHeight": 1.25 }
```

- Recommended id: date and topic, such as `SKETCH-261002-login-screen`.

## Anchors

None: comment on the whole document.

## Actions

| action | what adoc already did | what you do |
|---|---|---|
| `save` | wrote the JSON and the PNG (`applied: true`, no message of its own) | nothing; the change reaches you as the person's comment with the next message |
