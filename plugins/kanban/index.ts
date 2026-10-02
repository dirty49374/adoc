import { action, anchor, definePlugin, dropTarget, html, markdown, parseYaml, source } from '@adoc/plugin-kit';
import type { PluginDocument } from '@adoc/plugin-kit';

const HIDDEN = 'REMOVE';

interface Card {
  id: string;
  text: string;
  column: string;
}

function parse(doc: PluginDocument) {
  const data = (parseYaml(doc.text) ?? {}) as { title?: string; columns?: string[]; cards?: Card[] };
  if (!Array.isArray(data.columns) || !data.columns.length) throw new Error('columns must be a non-empty list');
  const cards = (data.cards ?? []).map((c) => ({ id: String(c.id), text: String(c.text ?? ''), column: String(c.column) }));
  const lines = doc.text.split('\n');
  const lineOf = (id: string) => lines.findIndex((l) => new RegExp(`^\\s*-\\s*id:\\s*['"]?${id}['"]?\\s*$`).test(l)) + 1;
  return { title: data.title ?? doc.key, columns: data.columns.map(String), cards, lineOf };
}

export default definePlugin({
  description: 'One screen of about ten cards in columns, to see where work stands.',
  layout: { kind: 'file', extension: '.yaml' },

  summarize(doc) {
    const { title, columns, cards } = parse(doc);
    const shown = cards.filter((c) => c.column !== HIDDEN && columns.includes(c.column));
    const fields: Record<string, number> = {};
    for (const column of columns.filter((c) => c !== HIDDEN)) fields[column] = shown.filter((c) => c.column === column).length;
    return { title, status: `${shown.length} cards`, fields };
  },

  render(doc) {
    const { columns, cards, lineOf } = parse(doc);
    const card = (c: Card) => html`
      <div class="adoc-card" ${anchor(c.id)} ${source(doc.file, lineOf(c.id))} ${action({ kind: 'drag', name: 'move', value: c.id })}>
        <span class="adoc-muted">${c.id}</span> ${markdown(c.text, { inline: true })}
      </div>`;
    return html`
      <div class="adoc-board">
        ${columns
          .filter((col) => col !== HIDDEN)
          .map(
            (col) => html`
              <div class="adoc-column" ${dropTarget('move', col)}>
                <div class="adoc-column-title">${col} <span class="adoc-muted">${cards.filter((c) => c.column === col).length}</span></div>
                ${cards.filter((c) => c.column === col).map(card)}
              </div>`,
          )}
      </div>
      ${columns.includes(HIDDEN) ? html`<div class="adoc-trash" ${dropTarget('move', HIDDEN)}>Drop here to remove</div>` : ''}`;
  },

  actions: {
    move(doc, event) {
      const { cards } = parse(doc);
      const card = cards.find((c) => c.id === event.value);
      if (!card) throw new Error(`no card ${event.value}`);
      if (card.column === event.to) return {};
      return { message: `user request: move card ${card.id} "${card.text}": ${card.column} => ${event.to}` };
    },
  },
});
