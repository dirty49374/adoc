import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AdocError } from './errors.js';
import { readSkillSource, type SkillSource } from './plugins.js';
import type { CheckEntry, Workspace } from './workspace.js';

/** One _Agent_Skill_ of the workspace; `pluginKey` for a _Plugin_Skill_. */
export interface SkillEntry extends SkillSource {
  readonly pluginKey?: string;
}

/** The folders of the core package and the _Plugin_Kit_, which own the skills `adoc` and `adoc-plugin-authoring`. */
const OWNERS = [dirname(dirname(fileURLToPath(import.meta.url))), dirname(dirname(createRequire(import.meta.url).resolve('@adoc/plugin-kit/skill/SKILL.md')))];

/** Every _Agent_Skill_: the core package and the kit in user scope, then each loaded plugin's skill in its scope. */
export async function listSkills(workspace: Workspace): Promise<SkillEntry[]> {
  const entries: SkillEntry[] = [];
  for (const owner of OWNERS) entries.push(await readSkillSource(owner, 'user'));
  for (const plugin of workspace.loadedPlugins()) if (plugin.skill) entries.push({ ...plugin.skill, pluginKey: plugin.key });
  return entries;
}

/** The `SKILL.md` of a skill, selected by its name as `adoc skill list` shows it, without its front matter. */
export async function viewSkill(workspace: Workspace, name: string): Promise<{ entry: SkillEntry; body: string }> {
  const entries = await listSkills(workspace);
  const entry = entries.find((e) => e.name === name);
  if (!entry) throw new AdocError('skill.missing', `No skill ${name}. Known: ${entries.map((e) => e.name).join(', ')}.`);
  const text = await readFile(join(entry.directory, 'SKILL.md'), 'utf8');
  return { entry, body: text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n+/, '') };
}

/** How to run the Vercel `skills` CLI: `ADOC_SKILLS_CLI`, by default `npx -y skills@1`. */
function skillsCommand(env: NodeJS.ProcessEnv): string[] {
  return (env.ADOC_SKILLS_CLI || 'npx -y skills@1').split(/\s+/).filter(Boolean);
}

function runSkills(args: string[], cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  const [command, ...prefix] = skillsCommand(env);
  return new Promise((done, fail) => {
    const child = spawn(command!, [...prefix, ...args], { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.stderr.on('data', (chunk: Buffer) => (output += chunk.toString('utf8')));
    child.on('error', (error) => fail(new AdocError('skill.install', `cannot run ${command}: ${error.message}`)));
    child.on('exit', (code) => (code === 0 ? done(output) : fail(new AdocError('skill.install', `${[command, ...prefix, ...args].join(' ')} failed (exit ${code}):\n${output.trim()}`))));
  });
}

export interface SkillInstallOptions {
  /** Agent names passed on to `skills --agent`, such as `claude-code` or `codex`; the skills CLI picks them when empty. */
  agents?: string[];
  env?: NodeJS.ProcessEnv;
}

/** _Skill_Install_Command_ `install` / `update`: `skills add <folder>` for each skill, `-g` for user scope. */
export async function installSkills(workspace: Workspace, options: SkillInstallOptions = {}): Promise<SkillEntry[]> {
  const env = options.env ?? process.env;
  const entries = await listSkills(workspace);
  const agents = options.agents?.length ? ['--agent', ...options.agents] : [];
  for (const entry of entries) await runSkills(['add', entry.directory, '--yes', ...(entry.scope === 'user' ? ['--global'] : []), ...agents], workspace.root, env);
  return entries;
}

/** _Skill_Install_Command_ `uninstall`: `skills remove` for the skills of each scope. */
export async function uninstallSkills(workspace: Workspace, options: SkillInstallOptions = {}): Promise<SkillEntry[]> {
  const env = options.env ?? process.env;
  const entries = await listSkills(workspace);
  const agents = options.agents?.length ? ['--agent', ...options.agents] : [];
  for (const scope of ['project', 'user'] as const) {
    const names = entries.filter((e) => e.scope === scope).map((e) => e.name);
    if (names.length) await runSkills(['remove', ...names, '--yes', ...(scope === 'user' ? ['--global'] : []), ...agents], workspace.root, env);
  }
  return entries;
}

async function readIfThere(path: string): Promise<string | undefined> {
  try {
    return await readFile(path, 'utf8');
  } catch {
    return undefined;
  }
}

/**
 * _Skill_Check_: each skill must be installed in `.agents/skills` or `.claude/skills` of the workspace or of the user's
 * home, with the same `SKILL.md` as its source.
 */
export async function checkSkills(workspace: Workspace, home = homedir()): Promise<CheckEntry[]> {
  const found: CheckEntry[] = [];
  for (const entry of await listSkills(workspace)) {
    const source = await readFile(join(entry.directory, 'SKILL.md'), 'utf8');
    const installed = [];
    for (const base of [workspace.root, home]) {
      for (const place of ['.agents/skills', '.claude/skills']) {
        const text = await readIfThere(join(base, place, entry.name, 'SKILL.md'));
        if (text !== undefined) installed.push(text);
      }
    }
    if (!installed.length) found.push({ level: 'warning', kind: 'skill-missing', message: `The agent skill ${entry.name} is not installed; run adoc skill install.` });
    else if (!installed.includes(source)) found.push({ level: 'warning', kind: 'skill-outdated', message: `The installed agent skill ${entry.name} differs from this adoc; run adoc skill update.` });
  }
  return found;
}
