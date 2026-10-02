import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

export async function isGitRepository(directory: string): Promise<boolean> {
  try {
    const { stdout } = await run('git', ['rev-parse', '--is-inside-work-tree'], { cwd: directory });
    return stdout.trim() === 'true';
  } catch {
    return false;
  }
}
