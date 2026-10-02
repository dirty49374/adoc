---
name: adoc-sketch
description: "SKETCH documents: drawings, such as UI wireframes, that the person draws in Excalidraw, saved as JSON with a PNG beside it. Use when a message says a sketch changed, when the person wants to draw something, or when a drawing must be read or tidied."
---

# SKETCH documents

Document keys look like `SKETCH-<id>`. Read the general workflow with `adoc skill view adoc`.

## Purpose

A SKETCH is a drawing the person makes in the web UI, usually a UI wireframe or a diagram that is easier to draw than to describe. It shows the agent what the person means, so that the agent can turn it into a NOTE, a spec or code.

## States and workflow

- A sketch has no states. The person draws; every change is saved at once, and a draft "The sketch … changed" waits in the composer until the person sends a message.
- When that message arrives, read the sketch and do what the message asks.
- You may offer the person an empty board when a drawing would help the conversation.

## Instructions

- Read **both** files of a changed sketch: look at the PNG to see the layout, and read the JSON for the exact texts, the shapes and how they connect.
- Describe back in one or two sentences what you understood from the drawing before you act on it, when it is not obvious.
- You may edit the JSON, for example to tidy a wireframe or add labels; keep `"type": "excalidraw"` and give every new element a unique `id`, `version: 1` and `versionNonce`. The open board picks up your change.
- Never write the PNG yourself: the web UI writes it on the person's next save, so after your own edit it shows the older drawing until then.
- To give the person an empty board, create the file below and open it for them with `adoc ui open SKETCH-<id>`.

## File

- `SKETCH-<id>.excalidraw`: the drawing as Excalidraw JSON (`"type": "excalidraw"`, `elements`, `appState`, `files`). Every shape is an element with `type` (`rectangle`, `ellipse`, `arrow`, `line`, `text`, …), position `x`, `y`, size `width`, `height`, and for text `text`. Arrows may bind to shapes (`startBinding`, `endBinding`).
- `SKETCH-<id>.png`: the same drawing as an image, a companion file written by the web UI on every save.
- An empty board:

```json
{ "type": "excalidraw", "version": 2, "source": "adoc", "elements": [], "appState": {}, "files": {} }
```

- Recommended id: date and topic, such as `SKETCH-261002-login-screen`.

## Anchors

None: comment on the whole document.

## Actions

| action | what adoc already did | what you do |
|---|---|---|
| `save` | wrote the JSON and the PNG (`applied: true`, no message of its own) | nothing; the change reaches you as the person's comment with the next message |
