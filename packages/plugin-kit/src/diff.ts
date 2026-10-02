import { escapeHtml, raw } from './html.js';
import type { HtmlFragment } from './types.js';

/** One line of a line diff. `line` is the 1-based line in the new text for `same` and `added`, in the old text for `removed`. */
export interface DiffLine {
  op: 'same' | 'added' | 'removed';
  text: string;
  line: number;
}

const LIMIT = 4_000_000;

/** Compares two texts line by line (longest common subsequence). */
export function diffLines(oldText: string, newText: string): DiffLine[] {
  const a = oldText.split('\n');
  const b = newText.split('\n');
  if (a.length * b.length > LIMIT) {
    return [...a.map((text, i) => ({ op: 'removed' as const, text, line: i + 1 })), ...b.map((text, i) => ({ op: 'added' as const, text, line: i + 1 }))];
  }
  const lcs = Array.from({ length: a.length + 1 }, () => new Uint32Array(b.length + 1));
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) lcs[i]![j] = a[i] === b[j] ? lcs[i + 1]![j + 1]! + 1 : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
  }
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) out.push({ op: 'same', text: b[j]!, line: ++j }), i++;
    else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) out.push({ op: 'removed', text: a[i]!, line: ++i });
    else out.push({ op: 'added', text: b[j]!, line: ++j });
  }
  while (i < a.length) out.push({ op: 'removed', text: a[i]!, line: ++i });
  while (j < b.length) out.push({ op: 'added', text: b[j]!, line: ++j });
  return out;
}

/**
 * Renders a line diff of two texts as HTML: added lines get `adoc-added`, removed lines `adoc-removed`.
 * With `file`, current lines carry their source position so that comments in the diff still point at the file.
 */
export function sourceDiff(oldText: string, newText: string, options: { file?: string } = {}): HtmlFragment {
  const rows = diffLines(oldText, newText).map((d) => {
    const cls = d.op === 'same' ? 'adoc-same' : d.op === 'added' ? 'adoc-added' : 'adoc-removed';
    const mark = d.op === 'same' ? ' ' : d.op === 'added' ? '+' : '-';
    const src = options.file && d.op !== 'removed' ? ` data-adoc-source="${escapeHtml(`${options.file}:${d.line}`)}"` : '';
    return `<div class="${cls}"${src}><span class="adoc-diff-mark">${mark}</span>${escapeHtml(d.text) || ' '}</div>`;
  });
  return raw(`<div class="adoc-diff">${rows.join('')}</div>`);
}
