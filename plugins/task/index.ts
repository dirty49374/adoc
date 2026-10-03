import { anchor, definePlugin, frontmatter, html, markdown, ref, slug, source } from '@agent-workshop/adoc-plugin-kit';
import type { PluginDocument } from '@agent-workshop/adoc-plugin-kit';


interface Section {
  heading: string;
  anchor: string;
  line: number;
  body: string;
  bodyLine: number;
}

function parse(doc: PluginDocument) {
  const { data, body, bodyLine } = frontmatter(doc.text);
  const lines = body.split('\n');
  const intro: string[] = [];
  const sections: Section[] = [];
  lines.forEach((l, i) => {
    const m = /^## (.+)$/.exec(l);
    if (m) sections.push({ heading: m[1]!.trim(), anchor: slug(m[1]!), line: bodyLine + i, body: '', bodyLine: bodyLine + i + 1 });
    else if (sections.length) sections[sections.length - 1]!.body += l + '\n';
    else intro.push(l);
  });
  const title = String(data.title ?? lines.find((l) => l.startsWith('# '))?.slice(2) ?? doc.key);
  return { data, title, status: String(data.status ?? 'TODO'), intro: intro.filter((l) => !l.startsWith('# ')).join('\n'), bodyLine, sections };
}

export default definePlugin({
  description: 'A detailed work order: front matter with title and status, and ## sections.',
  layout: { kind: 'file', extension: '.md' },

  summarize(doc) {
    const { data, title, status, sections } = parse(doc);
    const fields: Record<string, string | number> = { sections: sections.length };
    if (data.assignee) fields.assignee = String(data.assignee);
    if (Array.isArray(data.notes)) fields.notes = data.notes.join(', ');
    if (Array.isArray(data.related)) fields.related = data.related.join(', ');
    return { title, status, fields };
  },

  render(doc) {
    const { data, intro, bodyLine, sections } = parse(doc);
    return html`
      <div class="adoc-toolbar">
        ${data.assignee ? html`<span class="adoc-muted">assignee: ${String(data.assignee)}</span>` : ''}
        ${Array.isArray(data.notes) ? html`<span class="adoc-muted">notes: ${data.notes.map((k, i) => html`${i ? ', ' : ''}${ref(String(k))}`)}</span>` : ''}
        ${Array.isArray(data.related) ? html`<span class="adoc-muted">related: ${data.related.map((k, i) => html`${i ? ', ' : ''}${ref(String(k))}`)}</span>` : ''}
      </div>
      ${intro.trim() ? markdown(intro, { file: doc.file, line: bodyLine }) : ''}
      ${sections.map(
        (s) => html`
          <section class="adoc-section" ${anchor(s.anchor)}>
            <h2 ${source(doc.file, s.line)}>${s.heading}</h2>
            ${markdown(s.body, { file: doc.file, line: s.bodyLine })}
          </section>`,
      )}`;
  },
});
