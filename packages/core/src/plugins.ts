import { access, readFile } from 'node:fs/promises';
import { createRequire, registerHooks } from 'node:module';
import { dirname, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginDefinition } from '@agent-workshop/adoc-plugin-kit';
import semver from 'semver';
import { parse } from 'yaml';
import type { AdocConfig, DeclaredPlugin } from './config.js';
import { errorMessage } from './errors.js';
import type { AdocHome } from './home.js';

/** Project scope: inside the _Adoc_Workspace_; user scope: anywhere else, such as the user _Plugin_Directory_ or adoc's installation. */
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
  /** The _Plugin_Source_ as declared. */
  readonly source: string;
  /** The plugin folder, when its entry was found. */
  readonly directory?: string;
  readonly definition?: PluginDefinition;
  /** The _Plugin_Skill_. */
  readonly skill?: SkillSource;
  readonly error?: string;
}

const KIT = '@agent-workshop/adoc-plugin-kit';

// A plugin imports `@agent-workshop/adoc-plugin-kit` of the running adoc wherever its folder is, also outside any node_modules tree
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

/** The _Plugin_Directory_ next to the config file whose folder is `base`. */
export function pluginDirectory(base: string): string {
  return join(base, 'plugins');
}

/** A parsed GitHub _Plugin_Source_. */
export interface GithubSource {
  readonly owner: string;
  readonly repo: string;
  /** The folder inside the repository; empty for its root. */
  readonly folder: string;
  readonly ref?: string;
}

/** `github:<owner>/<repo>[/<folder>][#<ref>]`, or undefined for any other source. */
export function parseGithubSource(source: string): GithubSource | undefined {
  const m = /^github:([^/#\s]+)\/([^/#\s]+)((?:\/[^#\s]+)?)(?:#(\S+))?$/.exec(source);
  if (!m) return undefined;
  return { owner: m[1]!, repo: m[2]!, folder: m[3]!.replace(/^\/|\/$/g, ''), ...(m[4] ? { ref: m[4] } : {}) };
}

/** The folder a GitHub _Plugin_Source_ is fetched to: the plugin key in lowercase, in the _Plugin_Directory_. */
export function fetchedFolder(plugin: DeclaredPlugin): string {
  return join(pluginDirectory(plugin.base), plugin.key.toLowerCase());
}

async function entryIn(folder: string): Promise<string | undefined> {
  for (const candidate of [join(folder, 'index.ts'), join(folder, 'index.js'), join(folder, 'index.mjs')]) {
    if (await exists(candidate)) return candidate;
  }
  return undefined;
}

/** The plugin folder and its entry file for a _Plugin_Source_. */
async function locate(plugin: DeclaredPlugin): Promise<{ directory: string; entry: string }> {
  const { source, base } = plugin;
  if (source.startsWith('npm:')) {
    const spec = source.slice(4);
    const name = spec.startsWith('@') ? `@${spec.slice(1).split('@')[0]}` : spec.split('@')[0]!;
    const range = spec.slice(name.length + 1) || undefined;
    // As Node resolves it from the declaring file's folder upwards, then from the running adoc's installation.
    for (const from of [join(base, 'adoc.yaml'), import.meta.url]) {
      let manifest: string;
      try {
        manifest = createRequire(from).resolve(`${name}/package.json`);
      } catch {
        continue;
      }
      const directory = dirname(manifest);
      const { version } = JSON.parse(await readFile(manifest, 'utf8')) as { version?: string };
      if (range && version && !semver.satisfies(version, range, { includePrerelease: true })) {
        throw new Error(`${name} ${version} in ${directory} does not satisfy ${range}`);
      }
      return { directory, entry: createRequire(manifest).resolve(name) };
    }
    throw new Error(`no npm package ${name} near ${base} or in adoc's installation; install it with npm`);
  }
  if (source.startsWith('github:')) {
    if (!parseGithubSource(source)) throw new Error(`${source} is not github:<owner>/<repo>[/<folder>][#<ref>]`);
    const directory = fetchedFolder(plugin);
    const entry = await entryIn(directory);
    if (!entry) throw new Error(`${source} is not fetched into ${directory} yet; run adoc plugin install`);
    return { directory, entry };
  }
  if (source.startsWith('./') || source.startsWith('../') || source.startsWith('/')) {
    const directory = resolve(base, source);
    const entry = await entryIn(directory);
    if (!entry) throw new Error(`no index.ts or index.js in ${directory}`);
    return { directory, entry };
  }
  throw new Error(`${source} is not a plugin source; write npm:<package>, github:<owner>/<repo>/<folder>, or a path starting with ./, ../ or /`);
}

/** Fails when the plugin's `peerDependencies` range of the _Plugin_Kit_ excludes the running one. */
async function checkKit(directory: string): Promise<void> {
  let manifest: { peerDependencies?: Record<string, string> };
  try {
    manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8')) as typeof manifest;
  } catch {
    return;
  }
  const range = manifest.peerDependencies?.[KIT];
  if (!range) return;
  const { version } = JSON.parse(await readFile(createRequire(import.meta.url).resolve(`${KIT}/package.json`), 'utf8')) as { version: string };
  if (!semver.satisfies(version, range, { includePrerelease: true })) throw new Error(`the plugin needs ${KIT} ${range}, but this adoc has ${version}; update adoc or the plugin`);
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

async function loadOne(home: AdocHome, plugin: DeclaredPlugin, fresh: boolean): Promise<LoadedPlugin> {
  const { key, source } = plugin;
  let directory: string | undefined;
  try {
    const located = await locate(plugin);
    directory = located.directory;
    const entry = located.entry;
    await checkKit(directory);
    const skill = await readSkillSource(directory, scopeOf(home, directory));
    const url = pathToFileURL(entry);
    if (fresh) url.searchParams.set('adoc-load', String(++loadCounter));
    const module = (await import(url.href)) as { default?: PluginDefinition };
    if (!module.default) throw new Error(`${entry} has no default export; write export default definePlugin({ … })`);
    return { key, source, directory, definition: module.default, skill };
  } catch (error) {
    return { key, source, ...(directory ? { directory } : {}), error: errorMessage(error) };
  }
}

/** Loads every plugin declared in the _Adoc_Config_. A failure is kept as the plugin's error, never thrown. */
export async function loadPlugins(home: AdocHome, config: AdocConfig, fresh = false): Promise<Map<string, LoadedPlugin>> {
  const loaded = new Map<string, LoadedPlugin>();
  for (const declared of config.plugins) loaded.set(declared.key, await loadOne(home, declared, fresh));
  return loaded;
}
