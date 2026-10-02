// A stand-in for the Vercel skills CLI in tests: `add <folder> [--global]` copies the folder to .claude/skills/<name>
// of the workspace (or of HOME with --global); `remove <names…> [--global]` deletes them.
import { cpSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';

const [verb, ...rest] = process.argv.slice(2);
const base = rest.includes('--global') ? process.env.HOME : process.cwd();
const words = rest.filter((a) => !a.startsWith('--'));
if (verb === 'add') {
  const name = /^name: (.+)$/m.exec(readFileSync(join(words[0], 'SKILL.md'), 'utf8'))[1].trim();
  cpSync(words[0], join(base, '.claude/skills', name), { recursive: true });
} else if (verb === 'remove') {
  for (const name of words) rmSync(join(base, '.claude/skills', name), { recursive: true, force: true });
} else {
  process.exit(2);
}
