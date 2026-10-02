import { access, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { PluginDefinition } from '@adoc/plugin-kit';
import type { AdocConfig } from './config.js';
import { errorMessage } from './errors.js';

/** One declared _Plugin_, loaded or failed. */
export interface LoadedPlugin {
  readonly key: string;
  readonly from: string;
  readonly definition?: PluginDefinition;
  readonly error?: string;
}

async function exists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

async function resolveEntry(workspace: string, from: string): Promise<string> {
  if (from.startsWith('.') || from.startsWith('/')) {
    const base = resolve(workspace, from);
    for (const candidate of [base, join(base, 'index.ts'), join(base, 'index.js'), join(base, 'index.mjs')]) {
      if ((await exists(candidate)) && /\.(ts|js|mjs)$/.test(candidate)) return candidate;
    }
    throw new Error(`no index.ts or index.js in ${base}`);
  }
  return createRequire(join(workspace, 'package.json')).resolve(from);
}

let loadCounter = 0;

async function loadOne(workspace: string, key: string, from: string, fresh: boolean): Promise<LoadedPlugin> {
  try {
    const entry = await resolveEntry(workspace, from);
    const url = pathToFileURL(entry);
    if (fresh) url.searchParams.set('adoc-load', String(++loadCounter));
    const module = (await import(url.href)) as { default?: PluginDefinition };
    if (!module.default) throw new Error(`${entry} has no default export; write export default definePlugin({ … })`);
    return { key, from, definition: module.default };
  } catch (error) {
    return { key, from, error: errorMessage(error) };
  }
}

/** Loads every plugin declared in the _Adoc_Config_. A failure is kept as the plugin's error, never thrown. */
export async function loadPlugins(workspace: string, config: AdocConfig, fresh = false): Promise<Map<string, LoadedPlugin>> {
  const loaded = new Map<string, LoadedPlugin>();
  for (const declared of config.plugins) loaded.set(declared.key, await loadOne(workspace, declared.key, declared.from, fresh));
  return loaded;
}

/** Reads the _Plugin_Agent_Guide_ text of a plugin. */
export async function readGuide(plugin: PluginDefinition): Promise<string> {
  return plugin.guide instanceof URL ? readFile(plugin.guide, 'utf8') : plugin.guide;
}
