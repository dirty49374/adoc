import { mkdir, mkdtemp, readdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { listServers, writeServerRecord } from '../src/registry.js';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0)) await cleanup();
});

async function folder(): Promise<string> {
  const path = await mkdtemp(join(tmpdir(), 'adoc-registry-'));
  cleanups.push(() => rm(path, { recursive: true, force: true }));
  return path;
}

async function workspace(root: string, name: string): Promise<string> {
  const path = join(root, name);
  await mkdir(join(path, '.adoc'), { recursive: true });
  await writeFile(join(path, '.adoc', 'adoc.yaml'), 'plugins: {}\n');
  return path;
}

describe('server list', () => {
  it('tells online from offline servers and deletes the records of workspaces that are gone', async () => {
    const root = await folder();
    const env = { XDG_RUNTIME_DIR: join(root, 'run') };
    const live = await workspace(root, 'live');
    const stopped = await workspace(root, 'stopped');
    const server = createServer((request, response) => {
      response.setHeader('content-type', 'application/json');
      response.end(JSON.stringify(request.url === '/api/health' ? { workspace: live } : {}));
    });
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done));
    cleanups.push(() => new Promise((done) => server.close(() => done())));
    const port = (server.address() as { port: number }).port;
    await writeServerRecord({ pid: process.pid, url: `http://127.0.0.1:${port}`, workspace: live }, env);
    // A server that stopped without removing its record: its process is gone.
    await writeServerRecord({ pid: 2 ** 22 + 7, url: 'http://127.0.0.1:1', workspace: stopped }, env);
    await writeServerRecord({ pid: process.pid, url: 'http://127.0.0.1:1', workspace: join(root, 'gone') }, env);

    expect(await listServers(env)).toEqual([
      { workspace: live, url: `http://127.0.0.1:${port}`, pid: process.pid, status: 'online' },
      { workspace: stopped, url: 'http://127.0.0.1:1', pid: 2 ** 22 + 7, status: 'offline' },
    ]);
    expect((await readdir(join(root, 'run', 'adoc'))).sort()).toHaveLength(2);
  });

  it('lists nothing when no server ever ran here', async () => {
    expect(await listServers({ XDG_RUNTIME_DIR: join(await folder(), 'none') })).toEqual([]);
  });
});
