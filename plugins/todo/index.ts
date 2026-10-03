import { action, anchor, definePlugin, html, markdown, raw, source } from '@agent-workshop/adoc-plugin-kit';
import type { PluginDocument } from '@agent-workshop/adoc-plugin-kit';

const ITEM = /^(\s*)- \[( |x|X)\] (.*)$/;
const GROUP = /^## (.+)$/;

interface Item {
  line: number;
  done: boolean;
  text: string;
}

/** Items under one `## heading`; the items before the first heading form a group without heading. */
interface Group {
  line?: number;
  heading?: string;
  items: Item[];
}

function parse(doc: PluginDocument) {
  const lines = doc.text.split('\n');
  const title = lines.find((l) => l.startsWith('# '))?.slice(2).trim();
  const items: Item[] = [];
  const groups: Group[] = [{ items: [] }];
  lines.forEach((l, i) => {
    const heading = GROUP.exec(l);
    if (heading) groups.push({ line: i + 1, heading: heading[1]!.trim(), items: [] });
    const m = ITEM.exec(l);
    if (m) {
      const item = { line: i + 1, done: m[2] !== ' ', text: m[3]! };
      items.push(item);
      groups[groups.length - 1]!.items.push(item);
    }
  });
  return { title, items, groups: groups.filter((g) => g.heading !== undefined || g.items.length > 0), lines };
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
    const { items, groups } = parse(doc);
    const list = (group: Group) => html`
      <ul class="adoc-list">
        ${group.items.map(
          (item) => html`
            <li class="adoc-item ${item.done ? 'adoc-done' : ''}" ${anchor(item.line)} ${source(doc.file, item.line)}>
              <input type="checkbox" ${action({ kind: 'toggle', name: 'toggle', value: item.line, confirm: item.done ? 'Ask the agent to reopen this item?' : 'Ask the agent to do this item?' })} ${item.done ? raw('checked') : ''} />
              <span>${markdown(item.text, { inline: true })}</span>
            </li>`,
        )}
      </ul>`;
    return html`
      ${items.length ? '' : html`<p class="adoc-muted">No items yet.</p>`}
      ${groups.map((group) =>
        group.heading === undefined
          ? list(group)
          : html`
              <section class="adoc-section" ${anchor(group.line!)}>
                <h2 ${source(doc.file, group.line!)}>${markdown(group.heading, { inline: true })} <span class="adoc-muted">${group.items.filter((i) => i.done).length}/${group.items.length}</span></h2>
                ${list(group)}
              </section>`,
      )}`;
  },

  actions: {
    // A click asks the agent: checking an open item asks it to do the item, unchecking a done one to reopen it.
    // The file stays as it is until the agent checks or unchecks the item itself.
    toggle(doc, event) {
      const { lines } = parse(doc);
      const m = ITEM.exec(lines[Number(event.value) - 1] ?? '');
      if (!m) throw new Error(`line ${event.value} is not a task item`);
      return { message: `user request: ${event.checked ? 'do' : 'reopen'} item ${doc.key}#${event.value}: ${m[3]}` };
    },
  },
});
