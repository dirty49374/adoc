import { access, readFile } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginDefinition } from '@adoc/plugin-kit';
import { parse } from 'yaml';
import type { AdocConfig } from './config.js';
import { errorMessage } from './errors.js';
import type { AdocHome } from './home.js';

/** Project scope: inside the _Adoc_Workspace_; user scope: anywhere else, such as the user _Plugin_Directory_. */
export type Scope = 'project' | 'user';

/** An _Agent_Skill_ folder: `skill/` with a `SKILL.md` whose front matter names it. */
export interface SkillSource {
  readonly name: string;
  readonly description: string;
  readonly directory: string;
  readonly scope: Scope;
}

/** One declared _Plugin_, loaded or failed. */
export interface LoadedPlugin {
  readonly key: string;
  readonly from: string;
  /** The plugin folder, when its entry was found. */
  readonly directory?: string;
  readonly definition?: PluginDefinition;
  /** The _Plugin_Skill_. */
  readonly skill?: SkillSource;
  readonly error?: string;
}

const KIT = '@adoc/plugin-kit';

// A plugin imports `@adoc/plugin-kit` of the running adoc wherever its folder is, also outside any node_modules tree
// that has the kit (for example in the user _Plugin_Directory_).
registerHooks({
  resolve(specifier, context, next) {
    if (specifier === KIT || specifier.startsWith(`${KIT}/`)) return next(specifier, { ...context, parentURL: import.meta.url });
    return next(specifier, context);
  },
});

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/** The two _Plugin_Directory_ entries, project first. */
export function pluginDirectories(home: AdocHome, env: NodeJS.ProcessEnv = process.env): string[] {
  return [join(home.home, 'plugins'), join(env.XDG_CONFIG_HOME || join(homedir(), '.config'), 'adoc', 'plugins')];
}

async function entryIn(folder: string): Promise<string | undefined> {
  for (const candidate of [folder, join(folder, 'index.ts'), join(folder, 'index.js'), join(folder, 'index.mjs')]) {
    if ((await exists(candidate)) && /\.(ts|js|mjs)$/.test(candidate)) return candidate;
  }
  return undefined;
}

/** A path from the workspace root; a bare name in the plugin directories, project first; otherwise an npm package. */
async function resolveEntry(home: AdocHome, from: string, env: NodeJS.ProcessEnv): Promise<string> {
  if (from.startsWith('.') || from.startsWith('/')) {
    const base = resolve(home.workspace, from);
    const entry = await entryIn(base);
    if (!entry) throw new Error(`no index.ts or index.js in ${base}`);
    return entry;
  }
  if (!from.includes('/')) {
    for (const directory of pluginDirectories(home, env)) {
      const entry = await entryIn(join(directory, from));
      if (entry) return entry;
    }
  }
  try {
    return createRequire(join(home.workspace, 'package.json')).resolve(from);
  } catch {
    throw new Error(`no plugin ${from}: not a folder in ${pluginDirectories(home, env).join(' or ')}, and not an npm package`);
  }
}

export function scopeOf(home: AdocHome, path: string): Scope {
  const rel = relative(home.workspace, path);
  return rel && !rel.startsWith('..') && !rel.startsWith('/') ? 'project' : 'user';
}

/** Reads the `skill/SKILL.md` of an owner folder; throws when it is missing or has no name and description. */
export async function readSkillSource(owner: string, scope: Scope): Promise<SkillSource> {
  const directory = join(owner, 'skill');
  let text: string;
  try {
    text = await readFile(join(directory, 'SKILL.md'), 'utf8');
  } catch {
    throw new Error(`no skill/SKILL.md in ${owner}; every plugin needs its agent skill there`);
  }
  const front = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  const data = (front ? parse(front[1]!) : undefined) as { name?: unknown; description?: unknown } | undefined;
  if (typeof data?.name !== 'string' || typeof data.description !== 'string') throw new Error(`${join(directory, 'SKILL.md')} needs front matter with name and description`);
  return { name: data.name, description: data.description, directory, scope };
}

let loadCounter = 0;

async function loadOne(home: AdocHome, key: string, from: string, fresh: boolean, env: NodeJS.ProcessEnv): Promise<LoadedPlugin> {
  let directory: string | undefined;
  try {
    const entry = await resolveEntry(home, from, env);
    directory = dirname(entry);
    const skill = await readSkillSource(directory, scopeOf(home, entry));
    const url = pathToFileURL(entry);
    if (fresh) url.searchParams.set('adoc-load', String(++loadCounter));
    const module = (await import(url.href)) as { default?: PluginDefinition };
    if (!module.default) throw new Error(`${entry} has no default export; write export default definePlugin({ … })`);
    return { key, from, directory, definition: module.default, skill };
  } catch (error) {
    return { key, from, ...(directory ? { directory } : {}), error: errorMessage(error) };
  }
}

/** Loads every plugin declared in the _Adoc_Config_. A failure is kept as the plugin's error, never thrown. */
export async function loadPlugins(home: AdocHome, config: AdocConfig, fresh = false, env: NodeJS.ProcessEnv = process.env): Promise<Map<string, LoadedPlugin>> {
  const loaded = new Map<string, LoadedPlugin>();
  for (const declared of config.plugins) loaded.set(declared.key, await loadOne(home, declared.key, declared.from, fresh, env));
  return loaded;
}
