import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { AdocError } from './errors.js';
import type { Workspace } from './workspace.js';

/** One guide that `adoc skill` can show or install as an agent skill. */
export interface SkillEntry {
  name: string;
  description: string;
  pluginKey?: string;
}

const AGENT_SKILL = 'adoc';
const AUTHORING_SKILL = 'adoc-plugin-authoring';
const MANIFEST = 'skills.json';
export const DEFAULT_SKILL_DIRECTORY = '.claude/skills';

export function skillNameOf(pluginKey: string): string {
  return `adoc-${pluginKey.toLowerCase()}`;
}

export function listSkills(workspace: Workspace): SkillEntry[] {
  const entries: SkillEntry[] = [
    { name: AGENT_SKILL, description: 'Work as the assigned agent of an adoc workspace: wait for user messages, edit documents, check, commit.' },
    { name: AUTHORING_SKILL, description: 'Write an adoc plugin: one index.ts with definePlugin, summarize, render, actions and a guide.' },
  ];
  for (const plugin of workspace.pluginInfos()) {
    if (plugin.error) continue;
    entries.push({ name: skillNameOf(plugin.key), description: `${plugin.key} documents: ${plugin.description}`, pluginKey: plugin.key });
  }
  return entries;
}

/** The Markdown body of a skill, selected by its name as `adoc skill list` shows it. */
export async function viewSkill(workspace: Workspace, selector: string): Promise<{ entry: SkillEntry; body: string }> {
  const entries = listSkills(workspace);
  const entry = entries.find((e) => e.name === selector);
  if (!entry) throw new AdocError('skill.missing', `No skill ${selector}. Known: ${entries.map((e) => e.name).join(', ')}.`);
  let body: string;
  if (entry.name === AGENT_SKILL) body = await readFile(new URL('../guide.md', import.meta.url), 'utf8');
  else if (entry.name === AUTHORING_SKILL) body = await readFile(createRequire(import.meta.url).resolve('@adoc/plugin-kit/guide.md'), 'utf8');
  else body = `# ${entry.pluginKey} documents\n\nDocument keys look like \`${entry.pluginKey}-<id>\`. Read the general workflow with \`adoc skill view adoc\`.\n\n${await workspace.guide(entry.pluginKey!)}`;
  return { entry, body };
}

async function readManifest(workspace: Workspace): Promise<{ directory: string; names: string[] } | undefined> {
  try {
    return JSON.parse(await readFile(join(workspace.home.home, MANIFEST), 'utf8'));
  } catch {
    return undefined;
  }
}

/** Writes every skill as `<directory>/<name>/SKILL.md` and records the managed names; removes names no longer listed. */
export async function installSkills(workspace: Workspace, directory = DEFAULT_SKILL_DIRECTORY): Promise<SkillEntry[]> {
  const previous = await readManifest(workspace);
  const entries = listSkills(workspace);
  for (const entry of entries) {
    const { body } = await viewSkill(workspace, entry.name);
    const target = join(workspace.root, directory, entry.name);
    await mkdir(target, { recursive: true });
    await writeFile(join(target, 'SKILL.md'), `---\nname: ${entry.name}\ndescription: ${JSON.stringify(entry.description)}\n---\n\n${body}`);
  }
  if (previous) {
    for (const name of previous.names) {
      if (!entries.some((e) => e.name === name)) await rm(join(workspace.root, previous.directory, name), { recursive: true, force: true });
    }
  }
  await writeFile(join(workspace.home.home, MANIFEST), JSON.stringify({ directory, names: entries.map((e) => e.name) }, null, 2) + '\n');
  return entries;
}

export async function uninstallSkills(workspace: Workspace): Promise<string[]> {
  const previous = await readManifest(workspace);
  if (!previous) return [];
  for (const name of previous.names) await rm(join(workspace.root, previous.directory, name), { recursive: true, force: true });
  await rm(join(workspace.home.home, MANIFEST), { force: true });
  return previous.names;
}
