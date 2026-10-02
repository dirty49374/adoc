import { afterEach, describe, expect, it } from 'vitest';
import { WebSocket } from 'ws';
import { readServerRecord } from '../src/registry.js';
import { discoverHome } from '../src/home.js';
import { AdocServer } from '../src/server.js';
import { Workspace } from '../src/workspace.js';
import { fixture, freePort, type Fixture } from './fixture.js';

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
