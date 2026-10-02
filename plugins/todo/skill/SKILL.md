---
name: adoc-todo
description: "TODO documents: lists of one-line things to do, as Markdown task lists with optional groups. Use when the person wants something remembered or done that fits in one line, or comments on, checks or groups TODO items."
---

# TODO documents

Document keys look like `TODO-<id>`. Read the general workflow with `adoc skill view adoc`.

## Purpose

A TODO list keeps small things to do, each one line, so that nothing small gets lost. Bigger work, which needs a design or several steps, becomes a TASK instead.

## States and workflow

- An item is open (`- [ ]`) or done (`- [x]`). The person checks items in the web UI, or you check them when you finish them.
- Group related items under `## Heading` lines when the list grows; keep done items in their group so that the group shows its progress.

## Instructions

- Keep every item one line. When an item needs more than a line, it is a TASK: propose one.
- When you finish an item, check it and add a short "done: …" clause that says what was done and where, such as a commit or a document key.
- When the person asks to add something "to the TODO", add one item in the right group; create a group when none fits.
- Never delete an item the person wrote without asking; check it or rewrite it.

## File

`TODO-<id>.md`, a Markdown task list under an optional `# Title`:

```markdown
# GUI work

- [ ] Refactor PaymentRepo

## Login screen

- [x] Dark mode for the login screen; done: [[TASK-260930-dark-mode]]
- [ ] Remember the last user name
```

- One item per line: `- [ ] text` (open) or `- [x] text` (done). Write `[[KEY]]` to refer to another document.
- A `## Heading` line starts a group, until the next heading; items before the first heading have no group. Other lines are ignored by the view.
- Recommended id: a topic in English words, such as `TODO-gui` or `TODO-backend`.

## Anchors

The anchor of an item, and of a group heading, is its 1-based line number: `TODO-gui#5` is line 5. If the line moved, find the item by the `quote` of the message.

## Actions

| action | what adoc already did | what you do |
|---|---|---|
| `toggle` | wrote `[x]` or `[ ]` into the file (`applied: true`) | nothing, or follow up if checking the item implies work; commit with your next change |
