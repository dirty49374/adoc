import { action, anchor, definePlugin, frontmatter, html, markdown, ref, slug, source } from '@adoc/plugin-kit';
import type { PluginDocument } from '@adoc/plugin-kit';

interface Section {
  heading: string;
  anchor: string;
  line: number;
  body: string;
  bodyLine: number;
}

function parse(doc: PluginDocument) {
  const { data, body, bodyLine } = frontmatter(doc.text);
  const sections: Section[] = [];
  let intro = '';
  body.split('\n').forEach((l, i) => {
    const m = /^## (.+)$/.exec(l);
    if (m) sections.push({ heading: m[1]!.trim(), anchor: slug(m[1]!), line: bodyLine + i, body: '', bodyLine: bodyLine + i + 1 });
    else if (sections.length) sections[sections.length - 1]!.body += l + '\n';
    else intro += l + '\n';
  });
  const status = String(data.status ?? 'OPEN');
  const movedTo = data.moved_to ? String(data.moved_to) : undefined;
  return { title: String(data.title ?? doc.key), status, movedTo, intro, bodyLine, sections };
}

function count(section: Section | undefined): number {
  return section ? section.body.split('\n').filter((l) => /^\s*[-*] /.test(l)).length : 0;
}

function renderNote(doc: PluginDocument, previous?: PluginDocument) {
  const note = parse(doc);
  const before = previous ? parse(previous) : undefined;
  const old = new Map(before?.sections.map((s) => [s.anchor, s]));
  const removed = before ? before.sections.filter((s) => !note.sections.some((n) => n.anchor === s.anchor)) : [];
  return html`
    <div class="adoc-toolbar">
      ${note.movedTo ? html`<span class="adoc-muted">moved to ${ref(note.movedTo)}</span>` : ''}
      ${before && before.status !== note.status ? html`<span class="adoc-changed">status: ${before.status} → ${note.status}</span>` : ''}
      ${note.status === 'OPEN'
        ? html`<button ${action({ kind: 'click', name: 'archive', value: 'ARCHIVED' })}>→ archive</button>`
        : ''}
    </div>
    ${note.intro.trim() ? markdown(note.intro, { file: doc.file, line: note.bodyLine }) : ''}
    ${note.sections.map((s) => {
      const prior = old.get(s.anchor);
      const mark = !before ? '' : !prior ? 'adoc-added' : prior.body.trim() !== s.body.trim() ? 'adoc-changed' : '';
      return html`
        <section class="adoc-section ${mark}" ${anchor(s.anchor)}>
          <h2 ${source(doc.file, s.line)}>${s.heading}${mark ? html` <span class="adoc-chip">${mark === 'adoc-added' ? 'new' : 'changed'}</span>` : ''}</h2>
          ${markdown(s.body, { file: doc.file, line: s.bodyLine })}
        </section>`;
    })}
    ${removed.map(
      (s) => html`
        <section class="adoc-section adoc-removed">
          <h2>${s.heading} <span class="adoc-chip">removed</span></h2>
          ${markdown(s.body)}
        </section>`,
    )}`;
}

export default definePlugin({
  description: 'A free-form shared note: ideas from a conversation, open questions, decisions, or anything the two of you want to keep.',
  layout: { kind: 'file', extension: '.md' },

  summarize(doc) {
    const note = parse(doc);
    const questions = count(note.sections.find((s) => s.anchor === 'open-questions'));
    const decisions = count(note.sections.find((s) => s.anchor === 'decisions'));
    const fields: Record<string, string | number> = { 'open questions': questions, decisions };
    if (note.movedTo) fields['moved to'] = note.movedTo;
    return { title: note.title, status: note.status === 'OPEN' ? `OPEN · ${questions} open questions` : note.status, fields };
  },

  render: (doc) => renderNote(doc),
  renderChanges: (doc, previous) => renderNote(doc, previous),

  guide: new URL('./guide.md', import.meta.url),
});
