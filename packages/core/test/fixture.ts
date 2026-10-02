import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const PLUGINS = resolve(dirname(fileURLToPath(import.meta.url)), '../../../plugins');

export interface Fixture {
  root: string;
  home: string;
  write(path: string, text: string): Promise<void>;
  cleanup(): Promise<void>;
}

/** A temporary git workspace with the repository's TODO, TASK and KANBAN plugins. */
export async function fixture(files: Record<string, string> = {}, extraConfig = ''): Promise<Fixture> {
  const root = await mkdtemp(join(tmpdir(), 'adoc-test-'));
  execFileSync('git', ['init', '-q'], { cwd: root });
  const write = async (path: string, text: string) => {
    await mkdir(dirname(join(root, path)), { recursive: true });
    await writeFile(join(root, path), text);
  };
  await write(
    '.adoc/adoc.yaml',
    `plugins:\n  - key: TODO\n    from: ${PLUGINS}/todo\n  - key: TASK\n    from: ${PLUGINS}/task\n  - key: KANBAN\n    from: ${PLUGINS}/kanban\nwatch: [docs]\n${extraConfig}`,
  );
  await mkdir(join(root, 'docs'), { recursive: true });
  for (const [path, text] of Object.entries(files)) await write(path, text);
  return { root, home: join(root, '.adoc'), write, cleanup: () => rm(root, { recursive: true, force: true }) };
}

export async function freePort(): Promise<number> {
  return new Promise((done) => {
    const server = createServer();
    server.listen(0, '127.0.0.1', () => {
      const port = (server.address() as { port: number }).port;
      server.close(() => done(port));
    });
  });
}
