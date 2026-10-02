import { createHash } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** _Server_Record_: what a running _Adoc_Server_ writes outside the repository. */
export interface ServerRecord {
  pid: number;
  url: string;
  workspace: string;
}

function recordPath(workspace: string, env: NodeJS.ProcessEnv): string {
  const base = env.XDG_RUNTIME_DIR || tmpdir();
  return join(base, 'adoc', `${createHash('sha256').update(workspace).digest('hex').slice(0, 16)}.json`);
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
  await writeFile(path, JSON.stringify(record) + '\n');
}

/** Removes the record when it still belongs to this process. */
export async function removeServerRecord(workspace: string, env: NodeJS.ProcessEnv = process.env): Promise<void> {
  const current = await readServerRecord(workspace, env);
  if (!current || current.pid === process.pid) await rm(recordPath(workspace, env), { force: true });
}
