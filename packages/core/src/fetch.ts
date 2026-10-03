import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { promisify } from 'node:util';
import type { AdocConfig, DeclaredPlugin } from './config.js';
import { AdocError, errorMessage } from './errors.js';
import { fetchedFolder, parseGithubSource, pluginDirectory } from './plugins.js';

const run = promisify(execFile);

/** One entry of `plugins-lock.json`: the source as declared, the commit fetched, and a hash of the fetched files. */
interface LockEntry {
  readonly source: string;
  readonly commit: string;
  readonly hash: string;
}

/** What happened to one GitHub _Plugin_Source_. */
export interface FetchOutcome {
  readonly key: string;
  readonly source: string;
  readonly status: 'fetched' | 'present' | 'refused' | 'failed';
  readonly commit?: string;
  readonly reason?: string;
}

const LOCK_FILE = 'plugins-lock.json';

async function readLock(directory: string): Promise<Record<string, LockEntry>> {
  try {
    return JSON.parse(await readFile(join(directory, LOCK_FILE), 'utf8')) as Record<string, LockEntry>;
  } catch {
    return {};
  }
}

async function writeLock(directory: string, lock: Record<string, LockEntry>): Promise<void> {
  const sorted = Object.fromEntries(Object.entries(lock).sort(([a], [b]) => a.localeCompare(b)));
  await writeFile(join(directory, LOCK_FILE), `${JSON.stringify(sorted, null, 2)}\n`);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/** A hash of every file of a folder, by relative path and content, so that a changed fetched folder is noticed. */
export async function folderHash(folder: string): Promise<string> {
  const hash = createHash('sha256');
  const walk = async (dir: string): Promise<void> => {
    for (const entry of (await readdir(dir, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) await walk(path);
      else hash.update(relative(folder, path)).update('\0').update(await readFile(path)).update('\0');
    }
  };
  await walk(folder);
  return hash.digest('hex');
}

/** Fetches the folder of a GitHub _Plugin_Source_ at its ref into `target`, and returns the commit. */
async function fetchInto(source: string, target: string, env: NodeJS.ProcessEnv): Promise<string> {
  const github = parseGithubSource(source)!;
  const url = `${env.ADOC_GITHUB_URL || 'https://github.com'}/${github.owner}/${github.repo}.git`;
  const work = await mkdtemp(join(tmpdir(), 'adoc-fetch-'));
  try {
    await run('git', ['-C', work, 'init', '-q']);
    await run('git', ['-C', work, 'fetch', '-q', '--depth', '1', url, github.ref ?? 'HEAD']);
    await run('git', ['-C', work, 'checkout', '-q', 'FETCH_HEAD']);
    const commit = (await run('git', ['-C', work, 'rev-parse', 'HEAD'])).stdout.trim();
    const folder = join(work, github.folder);
    if (!(await exists(join(folder, 'index.js'))) && !(await exists(join(folder, 'index.ts'))) && !(await exists(join(folder, 'index.mjs')))) {
      throw new Error(`${github.folder || 'the repository root'} of ${github.owner}/${github.repo} has no index.ts or index.js`);
    }
    await rm(target, { recursive: true, force: true });
    await mkdir(target, { recursive: true });
    await cp(folder, target, { recursive: true, filter: (path) => !relative(folder, path).split(/[\\/]/).includes('.git') });
    return commit;
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}

/**
 * Fetches the GitHub _Plugin_Source_ entries of the config into their _Plugin_Directory_: with `update` false only the
 * ones not fetched yet, with `update` true again, refusing a folder whose files differ from what was fetched.
 */
export async function fetchGithubPlugins(config: AdocConfig, options: { update: boolean; keys?: readonly string[] }, env: NodeJS.ProcessEnv = process.env): Promise<FetchOutcome[]> {
  const github = config.plugins.filter((p) => parseGithubSource(p.source));
  const unknown = options.keys?.filter((key) => !github.some((p) => p.key === key)) ?? [];
  if (unknown.length) throw new AdocError('plugin.unknown', `No GitHub plugin source is declared for ${unknown.join(', ')}.`);
  const chosen = options.keys?.length ? github.filter((p) => options.keys!.includes(p.key)) : github;
  const outcomes: FetchOutcome[] = [];
  for (const plugin of chosen) outcomes.push(await fetchOne(plugin, options.update, env));
  return outcomes;
}

async function fetchOne(plugin: DeclaredPlugin, update: boolean, env: NodeJS.ProcessEnv): Promise<FetchOutcome> {
  const { key, source } = plugin;
  const directory = pluginDirectory(plugin.base);
  const target = fetchedFolder(plugin);
  const name = key.toLowerCase();
  const lock = await readLock(directory);
  const present = await exists(target);
  if (present && !update) return { key, source, status: 'present', ...(lock[name] ? { commit: lock[name].commit } : {}) };
  if (present && (!lock[name] || lock[name].hash !== (await folderHash(target)))) {
    return { key, source, status: 'refused', reason: `${target} differs from what was fetched; copy it to another folder to change it, or remove it to fetch again` };
  }
  try {
    const commit = await fetchInto(source, target, env);
    await writeLock(directory, { ...(await readLock(directory)), [name]: { source, commit, hash: await folderHash(target) } });
    return { key, source, status: 'fetched', commit };
  } catch (error) {
    return { key, source, status: 'failed', reason: errorMessage(error) };
  }
}
