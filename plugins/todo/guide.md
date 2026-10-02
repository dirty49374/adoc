A TODO document is a short list of one-line things to do.

## File

`TODO-<id>.md`, a Markdown task list under an optional `# Title`:

```markdown
# GUI work

- [ ] Refactor PaymentRepo
- [x] Dark mode for the login screen
- [ ] Paginate the order list, see [[TASK-260930-order-paging]]
```

- One item per line: `- [ ] text` (open) or `- [x] text` (done). Other lines are ignored by the view.
- Write `[[KEY]]` to refer to another document.
- Recommended id: a topic in English words, such as `TODO-gui` or `TODO-backend`.

## Anchors

The anchor of an item is its 1-based line number: `TODO-gui#5` is line 5.
A message's `quote` holds the item text; if the line moved, find the item by its text.

## Actions

| action | what adoc already did | what you do |
|---|---|---|
| `toggle` | wrote `[x]` or `[ ]` into the file (`applied: true`) | nothing, or follow up if the item implies work; commit with your next change |

## Typical requests

- "more detail" on an item: rewrite that line; keep it one line.
- "split this": replace the line with several items.
