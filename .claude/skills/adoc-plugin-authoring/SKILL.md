---
name: adoc-plugin-authoring
description: "Write an adoc plugin: one index.ts with definePlugin, summarize, render, actions and a guide."
---

# Writing an adoc plugin

A plugin defines one kind of document. It is **one folder with `index.ts` and `guide.md`**. No build step: adoc loads `index.ts` directly with Node's type stripping.

```
plugins/note/
  index.ts     ← export default definePlugin({ … })
  guide.md     ← tells the agent how to edit these documents
```

Register it in the workspace's `.adoc/adoc.yaml`, then check:

```yaml
plugins:
  - key: NOTE                 # uppercase letters only; documents are named NOTE-<id>.<ext>
    from: ./plugins/note      # path relative to the workspace root
```

```sh
adoc plugin list      # shows the plugin, or its load error
adoc check            # runs summarize and render on every document; exits 1 on errors (warnings do not fail it)
```

Actions run only from the web UI: start `adoc server run`, open a sample document and click, toggle or drag.

A running `adoc server run` reloads the plugin whenever a file in its folder changes.

## What a plugin provides

| field | type | meaning |
|---|---|---|
| `description` | `string` | one line for `adoc plugin list` |
| `layout` | `{ kind: 'file', extension: '.md' }` or `{ kind: 'folder', entry: 'bug.yaml' }` | a document is the file `NOTE-<id>.md`, or the folder `NOTE-<id>/` with the main file `bug.yaml` |
| `summarize(doc)` | returns `{ title, status, fields? }` | shown in the list and in reference tooltips; `status` is free text; `fields` values are string, number or boolean, so join lists: `attendees.join(', ')` |
| `render(doc)` | returns `html\`…\`` | the document body; adoc draws the header (key, title, status) around it, so do not repeat the title |
| `renderChanges(doc, previous)` | returns `html\`…\`` | optional; the body showing what changed since `previous`, an earlier version that the person saw last. Without it adoc shows a line diff of the main file |
| `actions` | `{ [name]: (doc, event) => { text?, files?, message? } }` | optional; see Actions |
| `guide` | `new URL('./guide.md', import.meta.url)` | the agent guide |

`doc` is `{ key, pluginKey, localId, path, file, text, files }`:
- `path`: the workspace-relative path of the document itself, the file or the folder;
- `file`: the workspace-relative path of the main file (the file itself, or the folder's entry file); use it for `source` and `markdown({ file })`;
- `text`: the main file's text; `files`: every file of the document by path relative to it.

If a function throws, adoc shows the message as the document's error and in `adoc check`; you do not need try/catch.

## Helpers (`import { … } from '@adoc/plugin-kit'`)

| helper | use |
|---|---|
| `html\`…\`` | build HTML; interpolated values are escaped, arrays are joined, `null`/`undefined`/`false` print nothing |
| `raw(s)` | insert trusted HTML unescaped, e.g. `${done ? raw('checked') : ''}` |
| `markdown(text, { file, line })` | Markdown → HTML; `[[KEY]]` becomes a reference; with `file` and `line` (1-based line where `text` starts) every block gets its source position. `{ inline: true }` for one line |
| `frontmatter(text)` | `{ data, body, bodyLine }` for YAML front matter; `bodyLine` is the 1-based file line of the first body line (the line after the closing `---`), ready for `markdown(body, { file: doc.file, line: bodyLine })`. YAML dates such as `2026-09-24` stay strings |
| `parseYaml`, `stringifyYaml` | YAML for `.yaml` documents |
| `anchor(value)` | put inside a start tag: the element can be commented on as `KEY#value` |
| `source(doc.file, line)` | put inside a start tag: comments on it carry `file:line` |
| `action({ kind, name, value })` | put inside a start tag: `click` on a `<button>`, `toggle` on an `<input type="checkbox">`, `drag` on a draggable element |
| `dropTarget(name, value)` | put inside a start tag: a drop zone for the drag action `name` |
| `ref(key, label?)` | a reference link to another document |
| `slug(text)` | `'Done when'` → `'done-when'`, handy for section anchors |
| `diffLines(oldText, newText)` | `[{ op: 'same' \| 'added' \| 'removed', text, line }]` for your own `renderChanges` |
| `sourceDiff(oldText, newText, { file })` | the line diff adoc shows by default, as HTML |

Markup helpers go **inside** start tags: `html\`<li ${anchor(n)} ${source(doc.file, n)}>…</li>\``. Nesting is fine: a section with `anchor()` can contain blocks with their own `source()`; adoc uses the nearest one.

Never add `<script>` or `on…=` attributes; adoc removes them. Every interaction is an action.

## Actions

The person clicks, toggles or drags a control marked with `action()`. adoc calls `actions[name](doc, event)` on the server.

`event` is `{ kind, name, value, checked?, to?, anchor? }`:
- `kind` is the control type you gave `action()` (`click`, `toggle` or `drag`); `name` selects the handler; `value` is the value you gave `action()`;
- `checked`: the new state, for toggle; `to`: the drop target's value, for drag;
- `anchor`: the bare value of the nearest enclosing `anchor()`, such as `goal` (not `KEY#goal`).

Return any of:
- `text`: new text of the main file (adoc writes it, refusing if the file changed since it was shown);
- `files`: new texts of files in a folder document, by path relative to the folder;
- `message`: text sent to the agent.

**Without a handler** for a name, adoc sends the agent a request `user request: <name> <value>` and changes nothing. That is often all you need: the agent then edits the file.

## CSS classes you can use without writing CSS

`adoc-list` + `adoc-item` (rows), `adoc-done` (struck through), `adoc-badge`, `adoc-muted`, `adoc-toolbar` (row of small buttons), `adoc-section` (with an `<h2>`), `adoc-board` + `adoc-column` + `adoc-column-title` + `adoc-card` (columns of cards), `adoc-trash` (a removal drop zone), `adoc-added`, `adoc-removed`, `adoc-changed` (for `renderChanges`). Tables, code blocks and lists from `markdown()` are styled too. Inline `style="…"` also works.

## Rules that avoid load errors

- Import types with `import type { PluginDocument } from '@adoc/plugin-kit';` (a separate `import type` line). Node strips types; a value import of a type fails.
- No TypeScript `enum`, `namespace` or parameter properties (`constructor(private x)`): Node cannot strip them.
- Keep the plugin in `index.ts`; import only `@adoc/plugin-kit` and Node built-ins.
- Action names are lowercase kebab-case: `toggle`, `set-status`.

## Complete example: the TODO plugin

```ts
import { action, anchor, definePlugin, html, markdown, raw, source } from '@adoc/plugin-kit';
import type { PluginDocument } from '@adoc/plugin-kit';

const ITEM = /^(\s*)- \[( |x|X)\] (.*)$/;

function parse(doc: PluginDocument) {
  const lines = doc.text.split('\n');
  const title = lines.find((l) => l.startsWith('# '))?.slice(2).trim();
  const items = lines.flatMap((l, i) => {
    const m = ITEM.exec(l);
    return m ? [{ line: i + 1, done: m[2] !== ' ', text: m[3]! }] : [];
  });
  return { title, items, lines };
}

export default definePlugin({
  description: 'A list of one-line things to do, as a Markdown task list.',
  layout: { kind: 'file', extension: '.md' },

  summarize(doc) {
    const { title, items } = parse(doc);
    const done = items.filter((i) => i.done).length;
    return { title: title ?? doc.key, status: `${done}/${items.length} done`, fields: { open: items.length - done, done } };
  },

  render(doc) {
    const { items } = parse(doc);
    return html`
      <ul class="adoc-list">
        ${items.map(
          (item) => html`
            <li class="adoc-item ${item.done ? 'adoc-done' : ''}" ${anchor(item.line)} ${source(doc.file, item.line)}>
              <input type="checkbox" ${action({ kind: 'toggle', name: 'toggle', value: item.line })} ${item.done ? raw('checked') : ''} />
              <span>${markdown(item.text, { inline: true })}</span>
            </li>`,
        )}
      </ul>`;
  },

  actions: {
    toggle(doc, event) {
      const { lines } = parse(doc);
      const index = Number(event.value) - 1;
      const m = ITEM.exec(lines[index] ?? '');
      if (!m) throw new Error(`line ${event.value} is not a task item`);
      lines[index] = `${m[1]}- [${event.checked ? 'x' : ' '}] ${m[3]}`;
      return { text: lines.join('\n'), message: `${doc.key}#${event.value} ${event.checked ? 'checked' : 'unchecked'}: ${m[3]}` };
    },
  },

  guide: new URL('./guide.md', import.meta.url),
});
```

## guide.md template

Write it for the agent that edits these documents:

```markdown
A NOTE document is … (one sentence).

## File
`NOTE-<id>.md`: (format with a short example). Recommended id: (e.g. date and title, `NOTE-261002-standup`).

## Anchors
The anchor of … is …: `NOTE-…#…`.

## Actions
| action | what adoc already did | what you do |
|---|---|---|
| `name` | (wrote X / nothing) | (edit Y) |
```
