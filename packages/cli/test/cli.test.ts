import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';
import { fixture, freePort, type Fixture } from '@adoc/testing';
import { runCommand } from '../src/program.js';

const ENTRY = resolve(import.meta.dirname, '../dist/entry.js');
let current: Fixture | undefined;
afterEach(async () => {
  await current?.cleanup();
  current = undefined;
});

async function run(argv: string[], cwd: string) {
  let stdout = '';
  let stderr = '';
  const code = await runCommand(argv, { cwd, env: {}, mcp: false, streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) }, stdin: async () => '' });
  return { code, stdout, stderr };
}

describe('adoc CLI', () => {
  it('lists plugins, checks with a nonzero exit on errors, and shows guides', async () => {
    current = await fixture({ 'docs/TODO-a.md': '- [ ] x [[TASK-none]]\n' });
    const list = await run(['plugin', 'list'], current.root);
    expect(list.stdout).toMatch(/TODO\s+1\s+file TODO-<id>\.md/);
    const json = await run(['plugin', 'list', '--output', 'json'], current.root);
    expect(JSON.parse(json.stdout)[0].key).toBe('TODO');
    expect((await run(['check'], current.root)).code).toBe(0);
    await current.write('docs/KANBAN-x.yaml', 'columns: []\n');
    const failed = await run(['check'], current.root);
    expect(failed.code).toBe(1);
    expect(failed.stdout).toContain('parse-error');
    expect((await run(['skill', 'view', 'adoc-todo'], current.root)).stdout).toContain('The anchor of an item, and of a group heading, is its 1-based line number');
    expect((await run(['skill', 'view', 'adoc'], current.root)).stdout).toContain('adoc message wait');
    await current.write('docs/_archive/TODO-old.md', '- [ ] archived x\n');
    expect((await run(['document', 'list'], current.root)).stdout).toMatch(/TODO-a/);
    expect((await run(['document', 'list'], current.root)).stdout).not.toMatch(/TODO-old/);
    expect((await run(['document', 'list', '--archived', '--plugin', 'TODO'], current.root)).stdout).toMatch(/TODO-old/);
    expect((await run(['document', 'search', 'X'], current.root)).stdout).toMatch(/docs\/TODO-a\.md:1  TODO-a  - \[ \] x/);
    expect((await run(['document', 'search', 'archived', '--archived'], current.root)).stdout).toMatch(/TODO-old/);
  });

  it('installs and uninstalls skills', async () => {
    current = await fixture();
    expect((await run(['skill', 'install'], current.root)).stdout).toContain('Installed 5 skills');
    expect(await readFile(join(current.root, '.claude/skills/adoc-task/SKILL.md'), 'utf8')).toMatch(/^---\nname: adoc-task\n/);
    expect((await run(['skill', 'uninstall'], current.root)).stdout).toContain('adoc-task');
  });

  it('fails clearly without a home or a server', async () => {
    current = await fixture({}, `server:\n  port: ${await freePort()}\n`);
    expect((await run(['check'], '/')).stderr).toContain('run adoc init');
    expect((await run(['message', 'wait', '--timeout', '1'], current.root)).stderr).toContain('start it with adoc server run');
  });

  it('serves the MCP tool over stdio and refuses local-only commands', async () => {
    current = await fixture({ 'docs/TODO-a.md': '- [ ] x\n' });
    const transport = new StdioClientTransport({ command: process.execPath, args: [ENTRY, 'mcp', 'run'], cwd: current.root, stderr: 'pipe' });
    const client = new Client({ name: 'test', version: '1' });
    await client.connect(transport);
    try {
      expect((await client.listTools()).tools.map((t) => t.name)).toEqual(['adoc']);
      const result = await client.callTool({ name: 'adoc', arguments: { cmd: 'plugin list' } });
      expect((result.content as Array<{ text: string }>)[0]!.text).toContain('TODO');
      const refused = await client.callTool({ name: 'adoc', arguments: { cmd: 'server run' } });
      expect(refused.isError).toBe(true);
      expect((refused.content as Array<{ text: string }>)[0]!.text).toContain('local-only');
    } finally {
      await client.close();
    }
  });

  it('runs the server outside a git repository and reports no git', async () => {
    current = await fixture();
    await import('node:fs/promises').then((fs) => fs.rm(join(current!.root, '.git'), { recursive: true }));
    const port = await freePort();
    const child = spawn(process.execPath, [ENTRY, 'server', 'run', '--port', String(port)], { cwd: current.root });
    try {
      await expect.poll(async () => (await fetch(`http://127.0.0.1:${port}/api/workspace`).then((r) => r.json(), () => ({}))).git, { timeout: 5000 }).toBe(false);
      const check = await run(['check'], current.root);
      expect(check.code).toBe(0);
      expect(check.stdout).toContain('no-git');
    } finally {
      child.kill();
    }
  });
});
