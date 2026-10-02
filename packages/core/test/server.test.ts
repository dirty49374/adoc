import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { readServerRecord } from '../src/registry.js';
import { discoverHome } from '../src/home.js';
import { AdocServer } from '../src/server.js';
import { Workspace } from '../src/workspace.js';
import { fixture, freePort, PLUGINS, type Fixture } from '@adoc/testing';

let current: { fixture: Fixture; server?: AdocServer } | undefined;
afterEach(async () => {
  await current?.server?.stop();
  await current?.fixture.cleanup();
  current = undefined;
});

async function start() {
  const f = await fixture({ 'docs/TODO-gui.md': '# GUI\n\n- [ ] One\n' });
  current = { fixture: f };
  const server = new AdocServer(await Workspace.open(await discoverHome(f.root)), { port: await freePort(), host: '127.0.0.1', log: () => undefined, debounceMs: 30 });
  current.server = server;
  await server.start();
  return { server, f };
}

const json = async (url: string, init?: RequestInit) => (await fetch(url, init)).json();
const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('AdocServer', () => {
  it('serves documents, accepts comments and delivers them through wait', async () => {
    const { server } = await start();
    expect(await json(`${server.url}/api/health`)).toMatchObject({ protocol: 'adoc/1' });
    expect((await json(`${server.url}/api/plugins/TODO/documents`)).documents[0].key).toBe('TODO-gui');
    const empty = await fetch(`${server.url}/api/messages`, post({ comments: [{ target: { level: 'workspace' }, text: '  ' }] }));
    expect(empty.status).toBe(400);
    await json(`${server.url}/api/messages`, post({ target: { level: 'document', key: 'TODO-gui' }, text: 'more detail' }));
    const { messages } = await json(`${server.url}/api/messages/wait?timeout=1000`);
    expect(messages[0].formatted).toBe('[adoc message 1] comment · TODO-gui\nmore detail\n');
    expect((await json(`${server.url}/api/messages`)).messages).toEqual([]);
  });

  it('applies an action, notices external edits, and refuses a stale version', async () => {
    const { server, f } = await start();
    const { version } = await json(`${server.url}/api/documents/TODO-gui`);
    const applied = await json(`${server.url}/api/actions`, post({ key: 'TODO-gui', version, event: { kind: 'toggle', name: 'toggle', value: '3', checked: true } }));
    expect(applied.status).toBe('applied');
    const refused = await fetch(`${server.url}/api/actions`, post({ key: 'TODO-gui', version, event: { kind: 'toggle', name: 'toggle', value: '3', checked: false } }));
    expect(refused.status).toBe(409);
    await f.write('docs/TODO-new.md', '# New\n');
    await expect.poll(async () => (await json(`${server.url}/api/plugins/TODO/documents`)).documents.length, { timeout: 3000 }).toBe(2);
  });

  it('lists the agent skills and renders one for the skill view', async () => {
    const { server } = await start();
    const { skills } = await json(`${server.url}/api/skills`);
    expect(skills.map((s: { name: string }) => s.name)).toEqual(expect.arrayContaining(['adoc', 'adoc-plugin-authoring', 'adoc-todo']));
    expect(skills.find((s: { name: string }) => s.name === 'adoc-todo')).toMatchObject({ pluginKey: 'TODO' });
    const todo = await json(`${server.url}/api/skills/adoc-todo`);
    expect(todo.html).toContain('<h1>TODO documents</h1>');
    expect((await fetch(`${server.url}/api/skills/nope`)).status).toBe(404);
  });

  it('writes an edited main file when its version is current, with the diff since the first unsent edit', async () => {
    const { server, f } = await start();
    const file = await json(`${server.url}/api/documents/TODO-gui/file`);
    const first = await json(`${server.url}/api/documents/TODO-gui/file`, post({ version: file.version, text: '# GUI\n\n- [ ] One\n- [ ] Two\n' }));
    expect(first).toMatchObject({ status: 'applied', diff: expect.stringContaining('+- [ ] Two') });
    const second = await json(`${server.url}/api/documents/TODO-gui/file`, post({ version: first.version, text: '# GUI\n\n- [x] One\n- [ ] Two\n', since: file.text }));
    expect(second.diff).toContain('-- [ ] One\n+- [x] One\n+- [ ] Two');
    expect(await readFile(join(f.root, 'docs/TODO-gui.md'), 'utf8')).toBe('# GUI\n\n- [x] One\n- [ ] Two\n');
    const stale = await fetch(`${server.url}/api/documents/TODO-gui/file`, post({ version: file.version, text: 'lost' }));
    expect(stale.status).toBe(409);
    expect(await readFile(join(f.root, 'docs/TODO-gui.md'), 'utf8')).toContain('Two');
  });

  it('keeps companion files with their document, writes binary contents, and serves a plugin client module', async () => {
    const f = await fixture({ 'docs/SKETCH-a.excalidraw': '{ "type": "excalidraw", "elements": [] }', 'docs/SKETCH-a.png': 'old', 'docs/SKETCH-lost.png': 'x' });
    await f.write('.adoc/adoc.yaml', `plugins:\n  - key: SKETCH\n    from: ${PLUGINS}/sketch\nwatch: [docs]\n`);
    current = { fixture: f };
    const ws = await Workspace.open(await discoverHome(f.root));
    expect(ws.record('SKETCH-a')?.companions).toEqual(['docs/SKETCH-a.png']);
    expect(ws.check().map((e) => e.path)).toContain('docs/SKETCH-lost.png');
    const server = new AdocServer(ws, { port: await freePort(), host: '127.0.0.1', log: () => undefined, debounceMs: 30 });
    current.server = server;
    await server.start();
    const file = await json(`${server.url}/api/documents/SKETCH-a/file`);
    expect(file).toMatchObject({ key: 'SKETCH-a', file: 'docs/SKETCH-a.excalidraw', text: '{ "type": "excalidraw", "elements": [] }' });
    const scene = '{ "type": "excalidraw", "elements": [{ "type": "rectangle" }] }';
    const saved = await json(`${server.url}/api/actions`, post({ key: 'SKETCH-a', version: file.version, event: { kind: 'client', name: 'save', value: JSON.stringify({ scene, png: Buffer.from([137, 80, 78, 71]).toString('base64') }) } }));
    expect(saved).toMatchObject({ status: 'applied', version: expect.any(String) });
    expect(saved.version).not.toBe(file.version);
    expect([...(await readFile(join(f.root, 'docs/SKETCH-a.png')))]).toEqual([137, 80, 78, 71]);
    expect(await readFile(join(f.root, 'docs/SKETCH-a.excalidraw'), 'utf8')).toBe(scene);
    const plugin = (await json(`${server.url}/api/workspace`)).plugins.find((p: { key: string }) => p.key === 'SKETCH');
    expect(plugin.client).toEqual({ style: true });
    expect((await fetch(`${server.url}/assets/plugins/SKETCH/index.js`)).headers.get('content-type')).toMatch(/javascript/);
    expect((await fetch(`${server.url}/assets/plugins/TODO/index.js`)).status).toBe(404);
  });

  it('serves built files under /assets/ and index.html for every client route', async () => {
    const { server } = await start();
    expect(await (await fetch(`${server.url}/p/TODO`)).text()).toContain('data-theme="dark"');
    const css = await fetch(`${server.url}/assets/app.css`);
    expect(css.headers.get('content-type')).toMatch(/text\/css/);
    const font = await fetch(`${server.url}/assets/fonts/D2Coding.woff2`);
    expect(font.headers.get('content-type')).toBe('font/woff2');
    for (const route of ['/', '/p/TODO/TODO-v1.txt', '/assets/../package.json']) {
      expect((await fetch(`${server.url}${route}`)).headers.get('content-type'), route).toMatch(/text\/html/);
    }
    expect((await fetch(`${server.url}/assets/missing.js`)).status).toBe(404);
  });

  it('runs once per workspace and records itself outside the repository', async () => {
    const { server, f } = await start();
    expect(await readServerRecord(f.root)).toMatchObject({ pid: process.pid, url: server.url });
    const other = new AdocServer(server.workspace, { port: await freePort(), host: '127.0.0.1', log: () => undefined });
    await expect(other.start()).rejects.toThrow(/already running/);
  });

  it('shows changes since a base version', async () => {
    const { server, f } = await start();
    const first = await json(`${server.url}/api/documents/TODO-gui`);
    await f.write('docs/TODO-gui.md', '# GUI\n\n- [ ] One\n- [ ] Two\n');
    await server.rescan();
    const view = await json(`${server.url}/api/documents/TODO-gui?base=${first.version}`);
    expect(view.changes.available).toBe(true);
    expect(view.changes.html).toContain('<div class="adoc-added" data-adoc-source="docs/TODO-gui.md:4">');
    expect((await json(`${server.url}/api/documents/TODO-gui?base=0000`)).changes.available).toBe(false);
    const { versions } = await json(`${server.url}/api/documents/TODO-gui/versions`);
    expect(versions.map((v: { version: string; current: boolean }) => [v.version === first.version, v.current])).toEqual([
      [false, true],
      [true, false],
    ]);
  });

  it('tracks browser sessions and sends the latest one to a document', async () => {
    const { server } = await start();
    const connect = (id: string) =>
      new Promise<{ ws: WebSocket; received: string[] }>((done) => {
        const ws = new WebSocket(`${server.url.replace('http', 'ws')}/api/events?session=${id}`);
        const received: string[] = [];
        ws.on('message', (d) => received.push(String(d)));
        ws.on('open', () => done({ ws, received }));
      });
    const a = await connect('aaa');
    const b = await connect('bbb');
    a.ws.send(JSON.stringify({ type: 'activity', location: '/p/TODO' }));
    await expect.poll(async () => (await json(`${server.url}/api/ui/sessions`)).sessions[0]?.id).toBe('aaa');
    const opened = await json(`${server.url}/api/ui/open`, post({ target: 'TODO-gui#3' }));
    expect(opened).toEqual({ session: 'aaa', location: '/p/TODO/TODO-gui#3' });
    await expect.poll(() => a.received.some((m) => m.includes('"navigate"'))).toBe(true);
    expect(b.received.some((m) => m.includes('"navigate"'))).toBe(false);
    a.ws.close();
    b.ws.close();
  });
});
