// A test plugin whose action writes the file itself, so that tests cover applied writes and stale-version refusals
// independently of how the repository's plugins choose to handle their actions.
import { action, definePlugin, html, raw } from '@garage49/adoc-plugin-kit';

const ITEM = /^- \[( |x)\] (.*)$/;

export default definePlugin({
  description: 'A test checklist whose boxes the user ticks.',
  layout: { kind: 'file', extension: '.md' },
  summarize: (doc) => ({ title: doc.key, status: 'test' }),
  render: (doc) =>
    html`${doc.text.split('\n').map((line, i) => {
      const m = ITEM.exec(line);
      return m ? html`<input type="checkbox" ${action({ kind: 'toggle', name: 'tick', value: i + 1 })} ${m[1] === 'x' ? raw('checked') : ''} />` : '';
    })}`,
  actions: {
    tick(doc, event) {
      const lines = doc.text.split('\n');
      const index = Number(event.value) - 1;
      const m = ITEM.exec(lines[index] ?? '');
      if (!m) throw new Error(`line ${event.value} is not an item`);
      lines[index] = `- [${event.checked ? 'x' : ' '}] ${m[2]}`;
      return { text: lines.join('\n'), message: `${doc.key}#${event.value} ${event.checked ? 'ticked' : 'unticked'}: ${m[2]}` };
    },
  },
});
