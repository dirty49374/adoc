import { spawn } from 'node:child_process';
import { mkdir, readdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { afterEach, describe, expect, it } from 'vitest';
import { fixture, freePort, type Fixture } from '@garage49/adoc-testing';
import { runCommand } from '../src/program.js';

const ENTRY = resolve(import.meta.dirname, '../dist/entry.js');
let current: Fixture | undefined;
afterEach(async () => {
  await current?.cleanup();
  current = undefined;
});

async function run(argv: string[], cwd: string, env: NodeJS.ProcessEnv = {}) {
  let stdout = '';
  let stderr = '';
  // The user config directory of vitest.config.ts, so that the developer's own one is never read.
  const code = await runCommand(argv, { cwd, env: { XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME, ...env }, mcp: false, streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) }, stdin: async () => '' });
  return { code, stdout, stderr };
}

describe('adoc CLI', () => {
  it('lists plugins, checks with a nonzero exit on errors, and shows guides', async () => {
    current = await fixture({ 'docs/TODO-a.md': '- [ ] x [[TASK-none]]\n' });
    const list = await run(['plugin', 'list'], current.root);
    expect(list.stdout).toMatch(/TODO\s+1\s+\S*plugins\/todo\s/);
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

  it('initializes a workspace with the five plugins of adoc, loaded from its installation', async () => {
    current = await fixture();
    const root = join(current.root, 'fresh');
    await mkdir(root);
    expect((await run(['init'], root)).code).toBe(0);
    const plugins = JSON.parse((await run(['plugin', 'list', '--output', 'json'], root)).stdout) as { key: string; error?: string; source: string }[];
    expect(plugins.map((p) => p.key)).toEqual(['NOTE', 'TODO', 'SKETCH', 'TASK', 'KANBAN']);
    expect(plugins.filter((p) => p.error)).toEqual([]);
    expect(plugins[1]?.source).toBe('npm:@garage49/adoc-plugin-todo');
  });

  it('installs skills through the skills CLI and warns about missing or outdated skills on every command', async () => {
    current = await fixture();
    const home = join(current.root, 'home');
    await mkdir(home);
    // The command runs with this env only (no PATH): name the node of this test by its path, not as `node`, which would
    // be looked up in /usr/bin:/bin (found on CI, where node lives in /usr/local/bin).
    const env = { HOME: home, ADOC_SKILLS_CLI: `${process.execPath} ${resolve(import.meta.dirname, 'fake-skills.mjs')}` };
    expect((await run(['plugin', 'list'], current.root, env)).stderr).toContain('adoc: warning: The agent skill adoc is not installed; run adoc skill install.');
    // The repository's plugins lie outside the test workspace, so every skill goes to user scope.
    expect((await run(['skill', 'install'], current.root, env)).stdout).toContain('Installed 6 skills: adoc (user), adoc-plugin-authoring (user), adoc-todo (user)');
    expect(await readdir(join(home, '.claude/skills/adoc-task'))).toEqual(['SKILL.md']);
    expect((await run(['plugin', 'list'], current.root, env)).stderr).toBe('');
    await writeFile(join(home, '.claude/skills/adoc-todo/SKILL.md'), 'old');
    expect((await run(['plugin', 'list'], current.root, env)).stderr).toContain('The installed agent skill adoc-todo differs from this adoc; run adoc skill update.');
    expect((await run(['skill', 'uninstall'], current.root, env)).stdout).toContain('adoc-task');
    expect(await readdir(join(home, '.claude/skills'))).toEqual([]);
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
