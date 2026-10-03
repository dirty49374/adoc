import { describe, expect, it } from 'vitest';
import { action, anchor, definePlugin, diffLines, sourceDiff, unifiedDiff, dropTarget, findReferences, frontmatter, html, markdown, raw, ref, slug, source } from '../src/index.js';

describe('html', () => {
  it('escapes interpolated text and keeps fragments', () => {
    const out = html`<p title="${'"x"'}">${'<b>'}${raw('<i>ok</i>')}${['a', html`<br>`]}${null}${false}</p>`;
    expect(out.html).toBe('<p title="&quot;x&quot;">&lt;b&gt;<i>ok</i>a<br></p>');
  });

  it('builds markup attributes', () => {
    expect(html`<li ${anchor(3)} ${source('docs/a.md', 3)}>`.html).toBe('<li data-adoc-anchor="3" data-adoc-source="docs/a.md:3">');
    expect(action({ kind: 'drag', name: 'move', value: 'c1' }).html).toContain('draggable="true"');
    expect(dropTarget('move', 'DONE').html).toBe('data-adoc-drop="move" data-adoc-drop-value="DONE"');
    expect(ref('TASK-a#b').html).toContain('data-adoc-ref="TASK-a#b"');
    expect(slug('Done when!')).toBe('done-when');
  });
});

describe('markdown', () => {
  it('turns [[KEY]] into references and records source lines', () => {
    const out = markdown('# Title\n\nSee [[TASK-a-b]] and [[TODO-x#3]].', { file: 'docs/x.md', line: 5 }).html;
    expect(out).toContain('<h1 data-adoc-source="docs/x.md:5">');
    expect(out).toContain('<p data-adoc-source="docs/x.md:7">');
    expect(out).toContain('data-adoc-ref="TASK-a-b"');
    expect(out).toContain('data-adoc-ref="TODO-x#3"');
  });

  it('shows task list items with read-only checkboxes', () => {
    const out = markdown('- [x] done\n- [ ] open\n- plain [ ] item\n').html;
    expect(out).toContain('<li class="adoc-task-item"><input type="checkbox" disabled checked> done</li>');
    expect(out).toContain('<li class="adoc-task-item"><input type="checkbox" disabled> open</li>');
    expect(out).toContain('<li>plain [ ] item</li>');
  });

  it('escapes raw HTML in the text', () => {
    expect(markdown('<script>x</script>').html).not.toContain('<script>');
  });

  it('marks fenced code of a known language with syntax classes', () => {
    const out = markdown('```ts\nconst a = "<b>";\n```').html;
    expect(out).toContain('<span class="hljs-keyword">const</span>');
    expect(out).toContain('&lt;b&gt;');
    expect(markdown('```\n<b>\n```').html).toContain('&lt;b&gt;');
  });

  it('marks a mermaid fence for the web UI, escaped', () => {
    const out = markdown('```mermaid\ngraph TD; A-->B<b>\n```', { file: 'x.md' }).html;
    expect(out).toContain('<pre data-adoc-source="x.md:1" class="adoc-mermaid">graph TD; A--&gt;B&lt;b&gt;');
  });

  it('finds references and splits front matter', () => {
    expect(findReferences('a [[TASK-1]] b [[KANBAN-s#c1]]')).toEqual(['TASK-1', 'KANBAN-s#c1']);
    const fm = frontmatter('---\ntitle: T\nstatus: DONE\n---\n\n## Goal\n');
    expect(fm.data).toEqual({ title: 'T', status: 'DONE' });
    expect(fm.bodyLine).toBe(5);
    expect(fm.body.split('\n')[1]).toBe('## Goal');
  });
});

describe('diff', () => {
  it('finds added and removed lines with their line numbers', () => {
    expect(diffLines('a\nb\nc', 'a\nB\nc\nd').map((d) => `${d.op[0]}${d.line}:${d.text}`)).toEqual(['s1:a', 'r2:b', 'a2:B', 's3:c', 'a4:d']);
    const out = sourceDiff('x', 'x\ny', { file: 'f.md' }).html;
    expect(out).toContain('<div class="adoc-added" data-adoc-source="f.md:2">');
  });
});

describe('unifiedDiff', () => {
  it('writes hunks with context and line numbers, and nothing for equal texts', () => {
    expect(unifiedDiff('a\nb\nc\nd\ne\nf\ng', 'a\nb\nC\nd\ne\nf\ng\nh', 'x.md', 1)).toBe(
      ['--- a/x.md', '+++ b/x.md', '@@ -2,3 +2,3 @@', ' b', '-c', '+C', ' d', '@@ -7,1 +7,2 @@', ' g', '+h'].join('\n'),
    );
    expect(unifiedDiff('same', 'same', 'x.md')).toBe('');
  });
});

describe('definePlugin', () => {
  const valid = { description: 'd', layout: { kind: 'file' as const, extension: '.md' }, summarize: () => ({ title: 't', status: 's' }), render: () => '' };

  it('accepts a valid definition', () => {
    expect(definePlugin(valid)).toBe(valid);
  });

  it('names each wrong field in one line', () => {
    expect(() => definePlugin({ ...valid, layout: { kind: 'file', extension: 'md' } })).toThrow(/layout\.extension: must look like "\.md"/);
    expect(() => definePlugin({ ...valid, actions: { Toggle: () => ({}) } })).toThrow(/actions\.Toggle/);
    expect(() => definePlugin({ ...valid, actions: { archive: () => ({}) } })).toThrow(/archive and unarchive are sent by the document header/);
  });
});
