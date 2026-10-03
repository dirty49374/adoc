import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { readConfig } from '../src/config.js';
import { fetchGithubPlugins } from '../src/fetch.js';
import { discoverHome } from '../src/home.js';
import { fixture, type Fixture } from '@agent-workshop/adoc-testing';

const DIST = pathToFileURL(resolve(import.meta.dirname, '../dist/index.js')).href;

/**
 * Loads the plugins of a workspace with the built core in a plain Node process: vitest runs dynamic imports through
 * its own module runner, which skips the `@agent-workshop/adoc-plugin-kit` resolve hook that the loader registers in Node.
 */
function loadInNode(root: string, xdg: string): Record<string, { error?: string; description?: string; skill?: { name: string; scope: string } }> {
  const script = `const c = await import(${JSON.stringify(DIST)}); const h = await c.discoverHome(${JSON.stringify(root)});
const p = await c.loadPlugins(h, await c.readConfig(h, { XDG_CONFIG_HOME: ${JSON.stringify(xdg)} }));
console.log(JSON.stringify(Object.fromEntries([...p.values()].map((x) => [x.key, { error: x.error, description: x.definition?.description, skill: x.skill }]))));`;
  return JSON.parse(execFileSync(process.execPath, ['--input-type=module', '-e', script], { encoding: 'utf8' }));
}

let current: Fixture | undefined;
afterEach(async () => {
  await current?.cleanup();
  current = undefined;
});

/** A minimal plugin folder that imports @agent-workshop/adoc-plugin-kit; `skill: false` leaves out skill/SKILL.md. */
async function writePlugin(folder: string, name: string, skill = true) {
  await mkdir(join(folder, 'skill'), { recursive: true });
  await writeFile(
    join(folder, 'index.ts'),
    `import { definePlugin, html } from '@agent-workshop/adoc-plugin-kit';\nexport default definePlugin({ description: '${name}', layout: { kind: 'file', extension: '.md' }, summarize: (doc) => ({ title: doc.key, status: 'x' }), render: () => html\`<p>x</p>\` });\n`,
  );
  if (skill) await writeFile(join(folder, 'skill/SKILL.md'), `---\nname: adoc-${name}\ndescription: "${name} documents"\n---\n\n# ${name}\n`);
}

/** A user config directory outside the workspace, as ~/.config is, removed with the fixture. */
async function userConfig(f: Fixture): Promise<string> {
  const xdg = await mkdtemp(join(tmpdir(), 'adoc-xdg-'));
  const cleanup = f.cleanup;
  f.cleanup = async () => {
    await cleanup();
    await rm(xdg, { recursive: true, force: true });
  };
  return xdg;
}

describe('plugin sources', () => {
  it('loads directories from the declaring file, lays the project config over the user config, and needs the skill', async () => {
    current = await fixture({}, '');
    const xdg = await userConfig(current);
    await writePlugin(join(xdg, 'adoc/plugins/mine'), 'user-mine');
    await writePlugin(join(xdg, 'adoc/plugins/both'), 'user-both');
    await writePlugin(join(xdg, 'adoc/plugins/gone'), 'gone');
    await writePlugin(join(current.root, '.adoc/plugins/both'), 'project-both');
    await writePlugin(join(current.root, '.adoc/plugins/bare'), 'bare', false);
    await writeFile(join(xdg, 'adoc/adoc.yaml'), 'plugins:\n  MINE: ./plugins/mine\n  BOTH: ./plugins/both\n  GONE: ./plugins/gone\n');
    await current.write('.adoc/adoc.yaml', 'plugins:\n  BOTH: ./plugins/both\n  BARE: ./plugins/bare\n  NONE: none\n  GONE: off\n');
    const plugins = loadInNode(current.root, xdg);
    expect(plugins.MINE).toMatchObject({ description: 'user-mine', skill: { name: 'adoc-user-mine', scope: 'user' } });
    expect(plugins.BOTH).toMatchObject({ description: 'project-both', skill: { scope: 'project' } });
    expect(plugins.BARE?.error).toMatch(/no skill\/SKILL\.md/);
    expect(plugins.NONE?.error).toMatch(/none is not a plugin source/);
    expect(plugins.GONE).toBeUndefined();
  });

  it('resolves npm sources from adoc\'s installation and checks the plugin-kit range of a plugin', async () => {
    current = await fixture({}, '');
    const xdg = await userConfig(current);
    await writePlugin(join(current.root, '.adoc/plugins/old'), 'old');
    await writeFile(join(current.root, '.adoc/plugins/old/package.json'), JSON.stringify({ name: 'old', peerDependencies: { '@agent-workshop/adoc-plugin-kit': '^9.0.0' } }));
    await current.write('.adoc/adoc.yaml', 'plugins:\n  TODO: npm:@agent-workshop/adoc-plugin-todo\n  OLD: ./plugins/old\n  MISSING: npm:adoc-plugin-missing\n');
    const plugins = loadInNode(current.root, xdg);
    expect(plugins.TODO).toMatchObject({ skill: { name: 'adoc-todo', scope: 'user' } });
    expect(plugins.TODO?.error).toBeUndefined();
    expect(plugins.OLD?.error).toMatch(/needs @agent-workshop\/adoc-plugin-kit \^9\.0\.0, but this adoc has 0\./);
    expect(plugins.MISSING?.error).toMatch(/no npm package adoc-plugin-missing/);
  });
});

describe('config', () => {
  it('orders plugins by ui.tabs, takes watch paths from the file, and refuses the earlier format', async () => {
    current = await fixture({}, '');
    const xdg = await userConfig(current);
    await current.write('.adoc/adoc.yaml', 'plugins:\n  A: ./a\n  B: ./b\n  C: ./c\nwatch: [../docs, ../notes]\nui:\n  tabs: [C, A]\n');
    const config = await readConfig(await discoverHome(current.root), { XDG_CONFIG_HOME: xdg });
    expect(config.plugins.map((p) => p.key)).toEqual(['C', 'A', 'B']);
    expect(config.watch).toEqual(['docs', 'notes']);
    await current.write('.adoc/adoc.yaml', 'plugins:\n  - key: TODO\n    from: ./todo\n');
    await expect(readConfig(await discoverHome(current.root), { XDG_CONFIG_HOME: xdg })).rejects.toThrow(/earlier format[\s\S]*TODO: npm:/);
  });
});

describe('plugin install', () => {
  it('fetches a GitHub source into the plugin directory, records it, and refuses to update a changed folder', async () => {
    current = await fixture({}, '');
    const xdg = await userConfig(current);
    const hub = join(xdg, 'hub');
    const repo = join(hub, 'someone', 'plugins.git');
    await writePlugin(join(repo, 'pkg/mind'), 'mind');
    const git = (...args: string[]) => execFileSync('git', ['-C', repo, ...args], { stdio: 'ignore' });
    git('init', '-q');
    git('add', '.');
    git('-c', 'user.email=t@t', '-c', 'user.name=t', 'commit', '-q', '-m', 'mind');
    await current.write('.adoc/adoc.yaml', 'plugins:\n  MIND: github:someone/plugins/pkg/mind\n');
    const env = { XDG_CONFIG_HOME: xdg, ADOC_GITHUB_URL: pathToFileURL(hub).href };
    const config = await readConfig(await discoverHome(current.root), env);
    const [fetched] = await fetchGithubPlugins(config, { update: false }, env);
    expect(fetched).toMatchObject({ key: 'MIND', status: 'fetched' });
    expect(loadInNode(current.root, xdg).MIND).toMatchObject({ description: 'mind', skill: { scope: 'project' } });
    const lock = JSON.parse(await readFile(join(current.root, '.adoc/plugins/plugins-lock.json'), 'utf8'));
    expect(lock.mind).toMatchObject({ source: 'github:someone/plugins/pkg/mind', commit: fetched!.commit });
    expect((await fetchGithubPlugins(config, { update: false }, env))[0]?.status).toBe('present');
    expect((await fetchGithubPlugins(config, { update: true }, env))[0]?.status).toBe('fetched');
    await writeFile(join(current.root, '.adoc/plugins/mind/index.ts'), '// changed\n');
    expect((await fetchGithubPlugins(config, { update: true }, env))[0]).toMatchObject({ status: 'refused' });
  });
});
