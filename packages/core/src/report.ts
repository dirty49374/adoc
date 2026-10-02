import type { CheckEntry } from './workspace.js';

/** Renders the report of _Adoc_Check_Command_ as text, one line per entry. */
export function formatCheck(entries: readonly CheckEntry[]): string {
  if (!entries.length) return 'adoc check: no problems';
  const errors = entries.filter((e) => e.level === 'error').length;
  const lines = entries.map((e) => `${e.level.padEnd(7)} ${e.kind.padEnd(18)} ${e.message}`);
  return `adoc check: ${errors} error(s), ${entries.length - errors} warning(s)\n${lines.join('\n')}`;
}
