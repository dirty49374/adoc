import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { createServer, type Server } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { readClaim, writeClaim } from '../src/claim.js';
import { discoverHome } from '../src/home.js';
import { resolveAgentPane } from '../src/herdr.js';
import { MessageQueue } from '../src/messages.js';
import { attachTransport, createTransport } from '../src/transports.js';
import { fixture, type Fixture } from './fixture.js';

interface FakeSession {
  name: string;
  panes: Array<{ pane_id: string; terminal_id: string; agent?: string; agent_session?: { value: string } }>;
  requests: Array<{ method: string; params: Record<string, unknown> }>;
  refuseAgentPrompt?: boolean;
}

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

/** A fake herdr home with one NDJSON socket per session. */
async function fakeHerdr(sessions: FakeSession[]): Promise<string> {
  const home = await mkdtemp(join(tmpdir(), 'adoc-herdr-'));
  const servers: Server[] = [];
  for (const session of sessions) {
    const dir = join(home, '.config', 'herdr', 'sessions', session.name);
    await mkdir(dir, { recursive: true });
    const server = createServer((socket) => {
      socket.on('data', (chunk) => {
        const request = JSON.parse(chunk.toString().trim()) as { id: string; method: string; params: Record<string, unknown> };
        session.requests.push({ method: request.method, params: request.params });
        let reply: unknown;
        if (request.method === 'session.snapshot') reply = { id: request.id, result: { type: 'session_snapshot', snapshot: { panes: session.panes } } };
        else if (request.method === 'agent.prompt' && session.refuseAgentPrompt) reply = { id: request.id, error: { code: 'agent_not_found', message: `agent target ${String(request.params.target)} not found` } };
        else reply = { id: request.id, result: { type: 'ok' } };
        socket.end(JSON.stringify(reply) + '\n');
      });
    });
    await new Promise<void>((done) => server.listen(join(dir, 'herdr.sock'), done));
    servers.push(server);
  }
  cleanups.push(async () => {
    for (const server of servers) await new Promise<void>((done) => server.close(() => done()));
    await rm(home, { recursive: true, force: true });
  });
  return home;
}

describe('resolveAgentPane', () => {
  const sessions = (): FakeSession[] => [
    { name: 'default', panes: [{ pane_id: 'w1:p1', terminal_id: 't1' }], requests: [] },
    { name: 'work', panes: [{ pane_id: 'w2:p3', terminal_id: 't3', agent: 'claude', agent_session: { value: 'session-xyz' } }], requests: [] },
  ];

  it('finds the pane by the caller session id across herdr sessions', async () => {
    const home = await fakeHerdr(sessions());
    const resolved = await resolveAgentPane({ HOME: home, CLAUDE_CODE_SESSION_ID: 'session-xyz', HERDR_PANE_ID: 'w1:p1' });
    expect(resolved).toMatchObject({ herdrSession: 'work', via: 'session-id', pane: { pane_id: 'w2:p3' } });
  });

  it('prefers --pane, then falls back to HERDR_PANE_ID, and fails clearly otherwise', async () => {
    const home = await fakeHerdr(sessions());
    expect((await resolveAgentPane({ HOME: home }, { pane: 'w2:p3' })).via).toBe('option');
    const sock = join(home, '.config/herdr/sessions/default/herdr.sock');
    expect(await resolveAgentPane({ HOME: home, HERDR_PANE_ID: 'w1:p1', HERDR_SOCKET_PATH: sock })).toMatchObject({ via: 'environment', herdrSession: 'default' });
    await expect(resolveAgentPane({ HOME: home })).rejects.toThrow(/--pane/);
  });
});

describe('claim and herdr transport', () => {
  let current: Fixture | undefined;
  afterEach(async () => {
    await current?.cleanup();
    current = undefined;
  });

  it('writes the claim and pushes messages with agent.prompt, falling back to typed input', async () => {
    const work: FakeSession = { name: 'work', panes: [{ pane_id: 'w2:p3', terminal_id: 't3' }], requests: [], refuseAgentPrompt: true };
    const home = await fakeHerdr([work]);
    current = await fixture();
    const adocHome = await discoverHome(current.root);
    await writeClaim(adocHome, await resolveAgentPane({ HOME: home }, { pane: 'w2:p3' }));
    const claim = await readClaim(adocHome);
    expect(claim).toMatchObject({ pane: 'w2:p3', herdrSession: 'work', terminal: 't3' });

    const queue = new MessageQueue();
    attachTransport(queue, createTransport({ kind: 'herdr' }, undefined, () => claim), () => undefined);
    queue.add({ kind: 'comment', comments: [{ target: { level: 'workspace' }, text: 'hello' }] });
    await expect.poll(() => queue.list().length).toBe(0);
    expect(work.requests.map((r) => r.method)).toEqual(expect.arrayContaining(['agent.prompt', 'pane.send_input']));
    expect(work.requests.find((r) => r.method === 'pane.send_input')?.params).toMatchObject({ pane_id: 'w2:p3', keys: ['enter'] });
  });

  it('holds messages while no agent has claimed the workspace', async () => {
    const queue = new MessageQueue();
    attachTransport(queue, createTransport({ kind: 'herdr' }, undefined, () => undefined), () => undefined);
    queue.add({ kind: 'comment', comments: [{ target: { level: 'workspace' }, text: 'hello' }] });
    await new Promise((r) => setTimeout(r, 20));
    expect(queue.list()).toHaveLength(1);
  });
});
