import { execFileSync } from 'node:child_process';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { fixture, type Fixture } from '@agent-workshop/adoc-testing';

const DIST = pathToFileURL(resolve(import.meta.dirname, '../dist/index.js')).href;

/**
 * Loads the plugins of a workspace with the built core in a plain Node process: vitest runs dynamic imports through
 * its own module runner, which skips the `@agent-workshop/adoc-plugin-kit` resolve hook that the loader registers in Node.
 */
function loadInNode(root: string, xdg: string): Record<string, { error?: string; description?: string; skill?: { name: string; scope: string } }> {
  const script = `const c = await import(${JSON.stringify(DIST)}); const h = await c.discoverHome(${JSON.stringify(root)});
const p = await c.loadPlugins(h, await c.readConfig(h), false, { XDG_CONFIG_HOME: ${JSON.stringify(xdg)} });
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

describe('plugin directories', () => {
  it('finds a bare name in the project directory first, then in the user directory, and needs the skill', async () => {
    current = await fixture({}, '');
    // The user directory lies outside the workspace, as ~/.config does.
    const config = await mkdtemp(join(tmpdir(), 'adoc-xdg-'));
    const cleanup = current.cleanup;
    current.cleanup = async () => {
      await cleanup();
      await rm(config, { recursive: true, force: true });
    };
    await writePlugin(join(config, 'adoc/plugins/mine'), 'user-mine');
    await writePlugin(join(config, 'adoc/plugins/both'), 'user-both');
    await writePlugin(join(current.root, '.adoc/plugins/both'), 'project-both');
    await writePlugin(join(config, 'adoc/plugins/bare'), 'bare', false);
    await current.write('.adoc/adoc.yaml', 'plugins:\n  - key: MINE\n    from: mine\n  - key: BOTH\n    from: both\n  - key: BARE\n    from: bare\n  - key: NONE\n    from: none\n');
    const plugins = loadInNode(current.root, config);
    expect(plugins.MINE).toMatchObject({ description: 'user-mine', skill: { name: 'adoc-user-mine', scope: 'user' } });
    expect(plugins.BOTH).toMatchObject({ description: 'project-both', skill: { scope: 'project' } });
    expect(plugins.BARE?.error).toMatch(/no skill\/SKILL\.md/);
    expect(plugins.NONE?.error).toMatch(/no plugin none/);
  });
});
