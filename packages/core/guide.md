# Working as the assigned agent of an adoc workspace

An adoc workspace is a git repository whose documents (TODO lists, TASK work orders, KANBAN boards, …) are files that **you edit directly**. A person reads them in the adoc web UI and sends you **messages**: comments on a document, a section or selected text, and notices of buttons, checkboxes and drags. adoc never edits on your behalf except when a plugin's action already applied a change (the message then says `applied: true`).

## Start

If you run in a herdr pane, run `adoc agent claim` once at the start of your session. It makes your pane the assigned agent: the person's comments and actions are pushed into your pane as prompts, and the web UI shows your terminal. Claiming from another pane takes the role over; `adoc agent show` says who holds it.

## The loop

1. `adoc message wait` — blocks until messages arrive, then prints all of them and forgets them. Use `--timeout 600` to return after ten minutes with `(no messages)`.
2. For each message, read the target document and do what the text asks.
3. `adoc check` — must report no errors after your edits. Fix what it reports.
4. `git add` and `git commit` your changes with a message that names the document keys, for example `TODO-gui: detail item 3`. Commit also any change a plugin applied (`applied: true`); adoc never commits.
5. When you created or substantially changed a document the person should look at, show it: `adoc ui open <KEY>` (or `<KEY>#<anchor>`). It moves the browser tab the person used last.
6. Go back to 1.

With the default `herdr` transport and a claim, adoc pushes each message to you as a prompt in the same format; then skip step 1 and handle each pushed message with steps 2–4. Without a claim, or with the `wait` transport, messages wait until `adoc message wait` takes them.

Before the loop, read the guide of every plugin you will touch: `adoc skill list`, then `adoc skill view adoc-todo` (plugin guides are named `adoc-<plugin key in lowercase>`). Each guide explains the file layout, what an anchor means and what to do for each action.

## Message format

```
[adoc message 17] comment
comments:
  - target: TASK-260930-order-paging#method
    source: docs/tasks/TASK-260930-order-paging.md:16
    quote: infinite scroll
    text: Use page numbers instead of infinite scroll.
  - target: TASK-260930-order-paging
    text: Then split the method into two tasks.

[adoc message 18] action
target: TODO-gui#3
action: toggle
value: "3"
applied: true
text: "TODO-gui#3 checked: Refactor PaymentRepo"
```

- A comment message lists one or more comments that the person collected and sent together; handle all of them, in order, before committing. An action message has a single `target`.
- `target` is `workspace`, a plugin key (`TASK`: about the plugin, e.g. "create a new one"), a document key (`TODO-gui`) or a document key with an anchor (`TASK-…#method`). The plugin guide says what an anchor means.
- `source` is the file and line the person pointed at; `quote` is the exact text they selected. A comment made with the comment button of an element has no `quote`; use `target` and `source`. If the file changed since, find the place by the quote or the surrounding text.
- An `action` message with `applied: false` is a **request**: make the change yourself (for example set a status, move a card). With `applied: true` the plugin already changed the file; follow up only if needed.

## Rules

- Find documents under the watch paths in `.adoc/adoc.yaml` (usually `docs/`). A document's file or folder name is its key: `TASK-260930-order-paging.md`.
- A new document key is `<PLUGIN KEY>-<local id>`; the local id uses lowercase letters, digits, `-`, `_`, `.` only, in English words, such as `260930-order-paging` (today's date as yymmdd, then a title) or `gui`. Never reuse an existing key.
- Refer to another document by writing `[[KEY]]` in Markdown content.
- Always read the current file before editing it: the person or a plugin action may have changed it.
- Uncommitted changes to documents that you did not make are the person's direct edits or plugin actions. Keep them and include them in your next commit. Never commit other files you did not change, such as `.adoc/adoc.yaml`.
- When you decline a request, for example a status change the work does not allow yet, leave the document as it is and say why where the person will see it.
- You cannot reply in the web UI. If a request is unclear or conflicts with the document, write the question into the document as a blockquote starting with `> Question:` next to the place it concerns, and remove it once answered.
