import { action, anchor, definePlugin, html, markdown, raw, source } from '@adoc/plugin-kit';
import type { PluginDocument } from '@adoc/plugin-kit';

const ITEM = /^(\s*)- \[( |x|X)\] (.*)$/;

interface Item {
  line: number;
  done: boolean;
  text: string;
}

function parse(doc: PluginDocument) {
  const lines = doc.text.split('\n');
  const title = lines.find((l) => l.startsWith('# '))?.slice(2).trim();
  const items: Item[] = [];
  lines.forEach((l, i) => {
    const m = ITEM.exec(l);
    if (m) items.push({ line: i + 1, done: m[2] !== ' ', text: m[3]! });
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
      ${items.length ? '' : html`<p class="adoc-muted">No items yet.</p>`}
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
