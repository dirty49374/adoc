import markdownIt, { type MarkdownIt, type StateInline } from 'markdown-it';
import { parse as parseYaml } from 'yaml';
import { raw } from './html.js';
import { ref } from './markup.js';
import type { HtmlFragment } from './types.js';

/** The reference notation `[[KEY]]` or `[[KEY#anchor]]`. */
export const REFERENCE_PATTERN = /\[\[([A-Z]+-[a-z0-9._-]+(?:#[^\]\s]+)?)\]\]/g;

function referenceRule(state: StateInline, silent: boolean): boolean {
  const src = state.src;
  if (src.charCodeAt(state.pos) !== 0x5b || src.charCodeAt(state.pos + 1) !== 0x5b) return false;
  const match = /^\[\[([A-Z]+-[a-z0-9._-]+(?:#[^\]\s]+)?)\]\]/.exec(src.slice(state.pos));
  if (!match) return false;
  if (!silent) {
    const token = state.push('adoc_ref', '', 0);
    token.content = match[1]!;
  }
  state.pos += match[0].length;
  return true;
}

function createParser(): MarkdownIt {
  const md = markdownIt({ html: false, linkify: true });
  md.inline.ruler.before('link', 'adoc_ref', referenceRule);
  md.renderer.rules.adoc_ref = (tokens, idx) => ref(tokens[idx]!.content).html;
  return md;
}

const parser = createParser();

export interface MarkdownOptions {
  /** The workspace-relative file the text comes from, usually `doc.file`. Enables source positions. */
  file?: string;
  /** The 1-based line in `file` where `text` starts. Default 1. */
  line?: number;
  /** Render a single line without a surrounding paragraph. */
  inline?: boolean;
}

/**
 * Renders Markdown to trusted HTML.
 * - `[[KEY]]` and `[[KEY#anchor]]` become reference links.
 * - With `file`, every block element gets its source position, so comments carry `file:line`.
 * - Raw HTML in the text is escaped.
 */
export function markdown(text: string, options: MarkdownOptions = {}): HtmlFragment {
  if (options.inline) return raw(parser.renderInline(text));
  const tokens = parser.parse(text, {});
  if (options.file !== undefined) {
    const first = options.line ?? 1;
    for (const token of tokens) {
      if (token.map && (token.nesting === 1 || token.type === 'fence' || token.type === 'code_block' || token.type === 'hr')) {
        token.attrSet('data-adoc-source', `${options.file}:${first + token.map[0]}`);
      }
    }
  }
  return raw(parser.renderer.render(tokens, parser.options, {}));
}

/** Lists every reference key written as `[[KEY]]` in the text. */
export function findReferences(text: string): string[] {
  return [...text.matchAll(REFERENCE_PATTERN)].map((m) => m[1]!);
}

/**
 * Splits YAML front matter from Markdown.
 * Returns the parsed data, the body and `bodyLine`, the 1-based line where the body starts,
 * which is what `markdown(body, { file, line: bodyLine })` needs.
 */
export function frontmatter(text: string): { data: Record<string, unknown>; body: string; bodyLine: number } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text);
  if (!match) return { data: {}, body: text, bodyLine: 1 };
  const data = (parseYaml(match[1]!) ?? {}) as Record<string, unknown>;
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('front matter must be a YAML mapping');
  const bodyLine = match[0].split('\n').length - (match[0].endsWith('\n') ? 0 : 1);
  return { data, body: text.slice(match[0].length), bodyLine };
}
