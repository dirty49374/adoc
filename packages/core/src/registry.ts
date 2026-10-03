import { createHash } from 'node:crypto';
import { access, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** _Server_Record_: what a running _Adoc_Server_ writes outside the repository. */
export interface ServerRecord {
  pid: number;
  url: string;
  workspace: string;
}

function recordDirectory(env: NodeJS.ProcessEnv): string {
  return join(env.XDG_RUNTIME_DIR || tmpdir(), 'adoc');
}

/** The id of a workspace: the first 16 hex digits of the SHA-256 of its absolute path, also the name of its record. */
export function workspaceId(workspace: string): string {
  return createHash('sha256').update(workspace).digest('hex').slice(0, 16);
}

function recordPath(workspace: string, env: NodeJS.ProcessEnv): string {
  return join(recordDirectory(env), `${workspaceId(workspace)}.json`);
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

/** The record of the running server of a workspace, or undefined when none runs. */
export async function readServerRecord(workspace: string, env: NodeJS.ProcessEnv = process.env): Promise<ServerRecord | undefined> {
  try {
    const record = JSON.parse(await readFile(recordPath(workspace, env), 'utf8')) as ServerRecord;
    return record.workspace === workspace && alive(record.pid) ? record : undefined;
  } catch {
    return undefined;
  }
}

export async function writeServerRecord(record: ServerRecord, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const path = recordPath(record.workspace, env);
  await mkdir(join(path, '..'), { recursive: true });
  // Written to a temporary file and renamed into place, so that a reader never sees part of a record.
  const temporary = `${path}.${process.pid}.tmp`;
  await writeFile(temporary, JSON.stringify(record) + '\n');
  await rename(temporary, path);
}

/** Removes the record when it still belongs to this process. */
export async function removeServerRecord(workspace: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const current = await readServerRecord(workspace, env);
  if (!current || current.pid === process.pid) await rm(recordPath(workspace, env), { force: true });
}

/** One entry of the _Server_List_Command_. */
export interface ListedServer {
  workspace: string;
  url: string;
  pid: number;
  status: 'online' | 'offline';
}

async function answers(record: ServerRecord): Promise<boolean> {
  try {
    const response = await fetch(`${record.url}/api/health`, { signal: AbortSignal.timeout(1500) });
    return response.ok && ((await response.json()) as { workspace?: string }).workspace === record.workspace;
  } catch {
    return false;
  }
}

/**
 * Every _Server_Record_ on this computer with its status: online when its process runs and its URL answers with the same
 * workspace, offline otherwise. A record whose workspace no longer has an adoc.yaml is deleted and left out.
 */
export async function listServers(env: NodeJS.ProcessEnv = process.env): Promise<ListedServer[]> {
  let names: string[];
  try {
    names = (await readdir(recordDirectory(env))).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }
  const servers: ListedServer[] = [];
  for (const name of names.sort()) {
    const path = join(recordDirectory(env), name);
    let record: ServerRecord;
    try {
      record = JSON.parse(await readFile(path, 'utf8')) as ServerRecord;
    } catch {
      continue;
    }
    try {
      await access(join(record.workspace, '.adoc', 'adoc.yaml'));
    } catch {
      await rm(path, { force: true });
      continue;
    }
    const online = alive(record.pid) && (await answers(record));
    servers.push({ workspace: record.workspace, url: record.url, pid: record.pid, status: online ? 'online' : 'offline' });
  }
  return servers.sort((a, b) => a.workspace.localeCompare(b.workspace));
}
