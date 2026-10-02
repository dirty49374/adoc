import { describe, expect, it } from 'vitest';
import { action, anchor, definePlugin, diffLines, sourceDiff, dropTarget, findReferences, frontmatter, html, markdown, raw, ref, slug, source } from '../src/index.js';

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

  it('escapes raw HTML in the text', () => {
    expect(markdown('<script>x</script>').html).not.toContain('<script>');
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

describe('definePlugin', () => {
  const valid = { description: 'd', layout: { kind: 'file' as const, extension: '.md' }, summarize: () => ({ title: 't', status: 's' }), render: () => '', guide: 'g' };

  it('accepts a valid definition', () => {
    expect(definePlugin(valid)).toBe(valid);
  });

  it('names each wrong field in one line', () => {
    expect(() => definePlugin({ ...valid, layout: { kind: 'file', extension: 'md' } })).toThrow(/layout\.extension: must look like "\.md"/);
    expect(() => definePlugin({ ...valid, actions: { Toggle: () => ({}) } })).toThrow(/actions\.Toggle/);
  });
});
