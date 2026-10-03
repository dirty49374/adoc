---
name: adoc-plugin-authoring
description: "Writes adoc plugins: a folder with index.ts (definePlugin: layout, summarize, render, actions), skill/SKILL.md and optional browser code. Use when creating or changing an adoc plugin or its skill."
---

# Writing an adoc plugin

A plugin defines one kind of document. It is **one folder with `index.ts` and `skill/SKILL.md`**. No build step: adoc loads `index.ts` directly with Node's type stripping (only a browser `client/`, below, needs one, which you run yourself).

```
plugins/note/
  index.ts         ← export default definePlugin({ … })
  skill/SKILL.md   ← the plugin's agent skill: tells the agent how to edit these documents
  package.json     ← optional: only when the plugin needs npm packages
  client/          ← optional: browser code (index.js, index.css), see "Browser code"
```

Register it in the workspace's `.adoc/adoc.yaml` (restart a running `adoc server run` to load it; a restart loses held messages, see "Start: claim" in the adoc skill), then check:

```yaml
plugins:
  - key: NOTE                 # uppercase letters only; documents are named NOTE-<local id>.<ext>
    from: note                # where it comes from: see "Installing plugins" in the adoc skill
```

Its scope, and so where `adoc skill install` installs its skill, follows from where the folder is (see "Project scope and user scope" in the adoc skill).

```sh
adoc plugin list      # shows the plugin, or its load error
adoc check            # runs summarize and render on every document; exits 1 on errors (warnings do not fail it)
```

Actions run only from the web UI: start `adoc server run`, open a sample document and click, toggle or drag (or use the elements of your client module).

A running `adoc server run` reloads the plugin whenever a file at the top of its folder changes. A reload imports `index.ts` again, but the other files it imports keep their old code: restart the server after changing them.

## What a plugin provides

| field | type | meaning |
|---|---|---|
| `description` | `string` | one line for `adoc plugin list` |
| `layout` | `{ kind: 'file', extension: '.md', companions?: ['.png'] }` or `{ kind: 'folder', entry: 'bug.yaml' }` | a document is the file `NOTE-<local id>.md` (with optional companion files, see below), or the folder `NOTE-<local id>/` with the main file `bug.yaml` |
| `summarize(doc)` | returns `{ title, status, fields? }` | shown in the list and in reference tooltips; `status` is free text; `fields` values are string, number or boolean, so join lists: `attendees.join(', ')` |
| `render(doc)` | returns `html\`…\`` | the document body; adoc draws the header (key, title, status) around it, so do not repeat the title |
| `renderChanges(doc, previous)` | returns `html\`…\`` | optional; the body showing what changed since `previous`, an earlier version that the user saw last. Without it adoc shows a line diff of the main file |
| `actions` | `{ [name]: (doc, event) => { text?, files?, companions?, message? } }` | optional; see Actions |

The agent skill is not a field: it is the file `skill/SKILL.md` next to `index.ts`, with front matter `name` and `description`; a plugin without it fails to load.

`doc` is `{ key, pluginKey, localId, path, file, text, files }`:
- `path`: the workspace-relative path of the document itself, the file or the folder;
- `file`: the workspace-relative path of the main file (the file itself, or the folder's entry file); use it for `source` and `markdown({ file })`;
- `text`: the main file's text; `files`: the files of the document, read as UTF-8 text: for a folder document every file by path relative to the folder (keep binary files out of folder documents), for a file document the main file under its name (companion files are not in it).

If a function throws, adoc shows the message as the document's error and in `adoc check`; you do not need try/catch.

The main file is written by hand, too: the agent edits it directly, and the user can edit the whole main file in the web UI. Parse it leniently (ignore lines you do not understand, give defaults for missing fields) and throw only when the file cannot be read at all.

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
| `unifiedDiff(oldText, newText, file, context?)` | a unified diff (`--- a/…`, `+++ b/…`, `@@` hunks) as text, for example for an action's message |

Markup helpers go **inside** start tags: `html\`<li ${anchor(n)} ${source(doc.file, n)}>…</li>\``. Nesting is fine: a section with `anchor()` can contain blocks with their own `source()`; adoc uses the nearest one.

Never add `<script>` or `on…=` attributes; adoc removes them. Every interaction is an action.

## Actions

The user clicks, toggles or drags a control marked with `action()`. adoc calls `actions[name](doc, event)` on the server.

`event` is `{ kind, name, value, checked?, to?, anchor? }`:
- `kind` is the control type you gave `action()` (`click`, `toggle` or `drag`), or `client` for an `adoc-action` event of your client module; `name` selects the handler; `value` is the value you gave `action()` (or the event's `value`), always as a string;
- `checked`: the new state, for toggle; `to`: the drop target's value, for drag;
- `anchor`: the bare value of the nearest enclosing `anchor()`, such as `goal` (not `KEY#goal`).

Return any of:
- `text`: new text of the main file (adoc writes it, refusing if the file changed since it was shown);
- `files`: new contents of files in a folder document, by path relative to the folder;
- `companions`: new contents of companion files of a file document, by extension, such as `{ '.png': { base64 } }`;
- `message`: text sent to the agent.

Any other key fails the action.

A content is text, or `{ base64 }` for binary data.

A handler sends the agent a message only when it returns `message`: with `applied: true` when adoc also wrote files, with `applied: false` when it wrote nothing (a request: the agent makes the change). A handler that writes without a `message` tells the agent nothing; it sees the change only as an uncommitted edit. When a write is due but the file changed since the user saw it, adoc writes nothing, sends nothing and shows the user why.

**Without a handler** for a name, adoc sends the agent a request `user request: <name> <value>` (for a toggle the value is the new checked state, for a drag `<value> to <to>`) and changes nothing. That is often all you need: the agent then edits the file.

## Companion files

A file document can have companion files: files beside it with the same name and another extension, declared in the layout, such as `layout: { kind: 'file', extension: '.excalidraw', companions: ['.png'] }` for `SKETCH-login.excalidraw` with `SKETCH-login.png`. They belong to the document (its version, its last update, archiving) but are not in `doc`, since they may be binary. An action writes one by returning `companions: { '.png': content }`.

## Browser code: the client module

When HTML is not enough, for example for a drawing board, the plugin brings browser code: the folder `client/` with `index.js` (an ES module with every library bundled in) and optionally `index.css`. adoc serves it at `/assets/plugins/<KEY>/` and loads it once per page. The module defines custom elements, and `render` returns their tags:

```ts
render: (doc) => html`<adoc-sketch data-adoc-document="${doc.key}" data-adoc-file="${doc.file}"></adoc-sketch>`,
```

The element talks to adoc only through DOM events and two URLs:

| what | how |
|---|---|
| read the main file | `fetch('/api/documents/<key>/file')` → `{ key, version, file, text }` |
| change files | dispatch `new CustomEvent('adoc-action', { bubbles: true, detail: { name, value, reply } })`; adoc runs the action (kind `client`) with the shown version and calls `reply({ status, version?, reason?, error? })`: `applied` (with the new `version`), `sent`, `refused` (with `reason`), `failed` (with `error`) or `busy` (another action was running: try again). Pass `value` as a string, or it arrives empty |
| tell the agent | dispatch `new CustomEvent('adoc-draft', { bubbles: true, detail: { text } })`: one draft comment on the document waits in the composer; a later one replaces it |
| follow changes | `window.addEventListener('adoc-documents-changed', (e) => e.detail.keys…)`: the changed keys, or `['*']` for all (after a plugin reload) |

Keep the `render` output the same across changes of the document (load the content in the element, not in attributes), or the page replaces the element on every change and it loses its state. A `client/` built from sources (with esbuild, for example) is a build output; see the SKETCH plugin for a complete example.

## Styling: classes and design tokens

The web UI styles your HTML; for plain HTML you write no CSS. Its look follows the opencode TUI theme: regions differ by surface (background shade) rather than borders, emphasis is an accent bar on the left edge, and no text is larger than the body text (headings stand out by colour and weight).

**Classes:**

| Class | Use |
|---|---|
| `adoc-list` + `adoc-item` | rows; `adoc-done` on an item strikes it through |
| `adoc-section` | a section, usually with an `<h2>` |
| `adoc-toolbar` | a row of small buttons and meta text |
| `adoc-muted` | quiet, smaller meta text |
| `adoc-chip` | a small label, such as a status or a tag |
| `adoc-block` | a panel block with an accent bar |
| `adoc-tone-primary`, `-secondary`, `-accent`, `-success`, `-warning`, `-error`, `-info` | the colour of an `adoc-block` bar or an `adoc-chip` text |
| `adoc-board` + `adoc-column` + `adoc-column-title` + `adoc-card` | columns of cards; columns wrap instead of scrolling |
| `adoc-trash` | a removal drop zone |
| `adoc-added`, `adoc-removed`, `adoc-changed` | marks for `renderChanges` |

Headings, lists, links, tables and code from `markdown()` get the theme's Markdown colours; a fenced code block that names its language (```` ```ts ````) is syntax-highlighted, and a ```` ```mermaid ```` block is drawn as a diagram.

**Design tokens:** when you need a colour in an inline `style="…"`, use a token instead of a literal, so that light and dark both work: `var(--adoc-text)`, `--adoc-text-muted`, `--adoc-surface`, `--adoc-surface-panel`, `--adoc-surface-element`, `--adoc-primary`, `--adoc-secondary`, `--adoc-accent`, `--adoc-success`, `--adoc-warning`, `--adoc-error`, `--adoc-info`, `--adoc-border`, `--adoc-border-subtle`. Sizes: `--adoc-size-base`, `--adoc-size-small`, `--adoc-size-tiny`; fonts: `--adoc-font-text`, `--adoc-font-mono`.

## Rules that avoid load errors

- Import types with `import type { PluginDocument } from '@adoc/plugin-kit';` (a separate `import type` line). Node strips types; a value import of a type fails.
- No TypeScript `enum`, `namespace` or parameter properties (`constructor(private x)`): Node cannot strip them.
- `index.ts` is the entry. It may import other files of the plugin folder (a server restart picks up changes to them, see above), `@adoc/plugin-kit` (adoc provides it wherever the plugin folder is), Node built-ins, and npm packages listed in the plugin's own `package.json` and installed with `npm install` in the plugin folder.
- Action names are lowercase kebab-case: `toggle`, `move`, `add-card`. Never name one `archive` or `unarchive`: the document header sends those, and the agent archives or restores the document.

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
});
```

## skill/SKILL.md

The plugin's skill is what the agent reads before it touches the plugin's documents, and what the user reads in the web UI (`SKILL.md` beside the plugin key, where they may comment on it or edit it; `adoc skill update` installs a changed one). `adoc skill install` installs the folder `skill/` for the agents the skills CLI detects, so keep only the skill in it, never code.

**Front matter.** `name` is `adoc-` and the plugin key in lowercase. The `description` is all an agent sees when it chooses a skill, so write it in the third person and say what the documents are and **when to use them**, with the words a user would use (the plugin key, the file extension, the kind of work). At most 1024 characters, no XML tags.

**Body.** Cover these, in whatever order and depth fits the plugin and the project:

1. **Purpose:** where these documents are used and what they achieve.
2. **States and workflow:** the states a document goes through and the recommended flow between them, including who moves it (the agent, or only the user).
3. **Instructions for the agent:** what to do, what not to do, and what to do when something happens: "do X", "never do Y", "when Z, do W".
4. **File:** the format, with a short example, and the recommended local id.
5. **Anchors:** what an anchor is, so that the agent finds a commented place.
6. **Actions:** for each action, what the plugin already did and what the agent is expected to do.

Write it short (the agent is capable; explain only what it cannot know), use one term for one thing throughout, and leave out what goes stale, such as dates or current counts.

Here is a sensible starting point; it is an example only, so change, drop or add sections to suit the plugin and the project:

```markdown
---
name: adoc-review
description: "REVIEW documents: one code review each, with its findings and their resolution. Use when the user asks for a review, comments on a finding, or wants to know what is still open before a release."
---

# REVIEW documents

Document keys look like `REVIEW-<local id>`. Read the general workflow with `adoc skill view adoc`.

## Purpose
One REVIEW records the review of one change: what was looked at, each finding, and how it was resolved, so that nothing found in a review is lost.

## States and workflow
`OPEN` → `ANSWERED` → `CLOSED`. You open a review and answer findings; only the user closes it.

## Instructions
- Write one finding per `##` section, with the file and line it concerns.
- Never delete a finding; mark it resolved and say how.
- When a comment disagrees with a finding, answer it under the finding and keep the review `ANSWERED`.

## File
`REVIEW-<local id>.md`: front matter `title`, `status`, then one `##` section per finding. Recommended local id: today's date (yymmdd) and a title, such as `REVIEW-261002-login-form`.

## Anchors
The anchor of a finding is its heading in lowercase with hyphens: `REVIEW-…#sql-in-loop`.

## Actions
| action | what adoc already did | what you do |
|---|---|---|
| `resolve` | nothing (`applied: false`) | mark the finding resolved, as the user asks |
```
