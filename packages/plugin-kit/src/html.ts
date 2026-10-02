import { HtmlFragment } from './types.js';

const ESCAPES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** Escapes text for HTML content and attribute values. */
export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ESCAPES[c]!);
}

/** Marks a string as trusted HTML so that `html` inserts it unescaped. */
export function raw(value: string): HtmlFragment {
  return new HtmlFragment(value);
}

function interpolate(value: unknown): string {
  if (value instanceof HtmlFragment) return value.html;
  if (Array.isArray(value)) return value.map(interpolate).join('');
  if (value === null || value === undefined || value === false) return '';
  return escapeHtml(String(value));
}

/**
 * Builds HTML. Interpolated values are escaped, except `HtmlFragment`s from `html`, `raw`,
 * `markdown` and the markup helpers. Arrays are joined; `null`, `undefined` and `false` print nothing.
 *
 *     html`<li ${anchor(item.id)}>${item.text}</li>`
 */
export function html(strings: TemplateStringsArray, ...values: unknown[]): HtmlFragment {
  let out = strings[0]!;
  values.forEach((value, index) => {
    out += interpolate(value) + strings[index + 1]!;
  });
  return new HtmlFragment(out);
}
