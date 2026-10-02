---
name: adoc-todo
description: "TODO documents: lists of one-line things to do, as Markdown task lists with optional groups. Use when the user wants something remembered or done that fits in one line, or comments on, checks or groups TODO items."
---

# TODO documents

Document keys look like `TODO-<local id>`. Read the general workflow with `adoc skill view adoc`.

## Purpose

A TODO list keeps small things to do, each one line, so that nothing small gets lost. Bigger work, which needs a design or several steps, becomes a TASK instead.

## States and workflow

- An item is open (`- [ ]`) or done (`- [x]`). The user checks items in the web UI, or you check them when you finish them.
- Group related items under `## Heading` lines when the list has more than about ten items; keep done items in their group so that the group shows its progress.

## Instructions

- Keep every item one line. When an item needs more than a line, it is a TASK: propose one in your conversation; once the user agrees, create the TASK and point the item to it: `- [ ] Rework the auth layer: [[TASK-261010-auth]]`.
- When you finish an item, check it and append `; done: …`, saying what was done and where, such as a commit or a document key.
- When the user asks to add something "to the TODO", add one item in the right group; create a group when none fits.
- Never delete or reword an item the user wrote without asking; you only check it, append the `done:` clause, or point it to a TASK the user agreed to.
- Check an item that points to a TASK when the TASK is DONE, and list the TODO in the TASK's `related:`.
- Ask the user in your conversation, not in the file: the view shows only items and group headings.

## File

`TODO-<local id>.md`, a Markdown task list under an optional `# Title`:

```markdown
# GUI work

- [ ] Refactor PaymentRepo

## Login screen

- [x] Dark mode for the login screen; done: [[TASK-260930-dark-mode]]
- [ ] Remember the last user name
```

- One item per line: `- [ ] text` (open) or `- [x] text` (done). Write `[[KEY]]` to refer to another document.
- A `## Heading` line starts a group, until the next heading; items before the first heading have no group. Other lines are ignored by the view.
- Recommended local id: a topic, such as `TODO-gui` or `TODO-backend`.

## Anchors

The anchor of an item, and of a group heading, is its 1-based line number: `TODO-gui#5` is line 5. If the line moved, find the item by the `quote` of the comment, or by the item text in an action message.

## Actions

| action | what adoc already did | what you do |
|---|---|---|
| `toggle` | wrote `[x]` or `[ ]` into the file (`applied: true`) | nothing more than committing it: the user marked the item done, or open again; it is not a request to do the work |
