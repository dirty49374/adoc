import { readFile, utimes } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverHome } from '../src/home.js';
import { formatMessage, MessageQueue } from '../src/messages.js';
import { attachTransport, createTransport } from '../src/transports.js';
import { Workspace } from '../src/workspace.js';
import { fixture, type Fixture } from '@adoc/testing';

const TODO = '# GUI\n\n- [ ] One [[TASK-a]]\n- [x] Two\n- [ ] Three [[TASK-missing]]\n';
const TASK = '---\ntitle: A task\nstatus: RUNNING\n---\n\n## Goal\n\nDo it.\n';

let current: Fixture | undefined;
afterEach(async () => {
  await current?.cleanup();
  current = undefined;
});

async function open(files: Record<string, string>) {
  current = await fixture(files);
  return Workspace.open(await discoverHome(current.root));
}

describe('Workspace', () => {
  it('indexes documents, summarizes and renders them', async () => {
    const ws = await open({ 'docs/TODO-gui.md': TODO, 'docs/tasks/TASK-a.md': TASK });
    expect(ws.pluginInfos().map((p) => [p.key, p.documents, p.error])).toEqual([
      ['TODO', 1, undefined],
      ['TASK', 1, undefined],
      ['KANBAN', 0, undefined],
    ]);
    expect(ws.summaryList('TODO')).toEqual([{ key: 'TODO-gui', path: 'docs/TODO-gui.md', updatedAt: expect.any(String), summary: { title: 'GUI', status: '1/3 done', fields: { open: 2, done: 1 } } }]);
    const view = ws.view('TASK-a')!;
    expect(view.summary?.status).toBe('RUNNING');
    expect(view.html).toContain('data-adoc-anchor="goal"');
    expect(ws.resolve('TASK-a#goal')).toMatchObject({ found: true, key: 'TASK-a' });
  });

  it('carries the last update of every document in the summary list, also for a parse error', async () => {
    const ws = await open({ 'docs/TODO-gui.md': TODO, 'docs/KANBAN-broken.yaml': 'title: x\n' });
    const when = new Date('2026-01-02T03:04:05.000Z');
    await utimes(join(current!.root, 'docs/TODO-gui.md'), when, when);
    await utimes(join(current!.root, 'docs/KANBAN-broken.yaml'), when, when);
    await ws.refresh();
    expect(ws.summaryList('TODO')[0]!.updatedAt).toBe(when.toISOString());
    expect(ws.summaryList('KANBAN')[0]).toMatchObject({ key: 'KANBAN-broken', updatedAt: when.toISOString(), error: expect.any(String) });
    await current!.write('docs/TODO-gui.md', `${TODO}- [ ] Four\n`);
    await ws.refresh();
    expect(Date.parse(ws.summaryList('TODO')[0]!.updatedAt)).toBeGreaterThan(when.getTime());
  });

  it('reports every kind of problem in check', async () => {
    const ws = await open({
      'docs/TODO-gui.md': TODO,
      'docs/tasks/TASK-a.md': TASK,
      'docs/other/TASK-a.md': TASK,
      'docs/FOO-x.md': 'x',
      'docs/TASK-Bad.md': TASK,
      'docs/TASK-wrong.txt': 'x',
      'docs/KANBAN-broken.yaml': 'title: x\n',
    });
    const kinds = ws.check().map((e) => `${e.level}:${e.kind}`);
    expect(kinds).toEqual(
      expect.arrayContaining(['warning:unknown-plugin-key', 'error:duplicate-key', 'error:invalid-local-id', 'warning:layout-mismatch', 'error:parse-error', 'warning:broken-reference']),
    );
    expect(ws.check().find((e) => e.kind === 'broken-reference')?.message).toContain('TASK-missing');
  });

  it('applies a plugin action, refuses a stale version and falls back to the default handler', async () => {
    const ws = await open({ 'docs/TODO-gui.md': TODO, 'docs/tasks/TASK-a.md': TASK });
    const version = ws.view('TODO-gui')!.version;
    const applied = await ws.applyAction('TODO-gui', { kind: 'toggle', name: 'toggle', value: '3', checked: true, anchor: '3' }, version);
    expect(applied).toMatchObject({ status: 'applied', message: { applied: true, text: 'TODO-gui#3 checked: One [[TASK-a]]', target: { level: 'anchor', key: 'TODO-gui', anchor: '3' } } });
    expect(await readFile(join(current!.root, 'docs/TODO-gui.md'), 'utf8')).toContain('- [x] One');
    const stale = await ws.applyAction('TODO-gui', { kind: 'toggle', name: 'toggle', value: '3', checked: false }, version);
    expect(stale.status).toBe('refused');
    const request = await ws.applyAction('TASK-a', { kind: 'click', name: 'set-status', value: 'DONE' }, ws.view('TASK-a')!.version);
    expect(request).toMatchObject({ status: 'sent', message: { applied: false, text: 'user request: set-status DONE' } });
  });
});

describe('messages', () => {
  it('formats both kinds in the adoc message format', () => {
    const queue = new MessageQueue();
    const comment = queue.add({
      kind: 'comment',
      target: { level: 'document', key: 'TASK-a' },
      text: 'Please look at these.',
      comments: [
        { target: { level: 'anchor', key: 'TASK-a', anchor: 'goal' }, text: 'line one\nline two', quote: 'Do it', source: 'docs/TASK-a.md:8' },
        { target: { level: 'document', key: 'TASK-a' }, text: 'and this' },
      ],
    });
    expect(formatMessage(comment)).toBe(
      '[adoc message 1] comment · TASK-a\nPlease look at these.\n--\ncomments:\n  - target: TASK-a#goal\n    source: docs/TASK-a.md:8\n    quote: Do it\n    text: |-\n      line one\n      line two\n  - target: TASK-a\n    text: and this\n',
    );
    const action = queue.add({ kind: 'action', target: { level: 'plugin', pluginKey: 'TASK' }, action: 'move', value: 'c1', to: 'DONE', applied: false, text: 'move' });
    expect(formatMessage(action)).toBe('[adoc message 2] action · TASK\nmove\n--\naction: move\nvalue: c1\nto: DONE\napplied: false\n');
    expect(formatMessage(queue.add({ kind: 'comment', target: { level: 'workspace' }, text: 'just text', comments: [] }))).toBe('[adoc message 3] comment · workspace\njust text\n');
  });

  it('waits, takes everything in order, and times out empty', async () => {
    const queue = new MessageQueue();
    const waiting = queue.wait();
    queue.add({ kind: 'comment', comments: [{ target: { level: 'workspace' }, text: 'a' }] });
    expect((await waiting).map((m) => m.number)).toEqual([1]);
    expect(await queue.wait(20)).toEqual([]);
  });

  it('pushes through a push transport and keeps messages held when delivery fails', async () => {
    const queue = new MessageQueue();
    const calls: string[][] = [];
    let fail = true;
    attachTransport(
      queue,
      createTransport({ kind: 'hc', target: 'me' }, async (file, args) => {
        calls.push([file, ...args]);
        if (fail) throw new Error('down');
      }),
      () => undefined,
    );
    queue.add({ kind: 'comment', comments: [{ target: { level: 'workspace' }, text: 'a' }] });
    await new Promise((r) => setTimeout(r, 10));
    expect(queue.list()).toHaveLength(1);
    fail = false;
    queue.add({ kind: 'comment', comments: [{ target: { level: 'workspace' }, text: 'b' }] });
    await new Promise((r) => setTimeout(r, 10));
    expect(queue.list()).toHaveLength(0);
    expect(calls[0]!.slice(0, 2)).toEqual(['hc', 'send']);
    expect(calls.at(-1)!.at(-1)).toContain('[adoc message 2] comment');
  });
});
