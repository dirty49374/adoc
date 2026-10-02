import { escapeHtml, raw } from './html.js';
import type { HtmlFragment } from './types.js';

function attr(name: string, value: string): string {
  return `${name}="${escapeHtml(value)}"`;
}

/** Attributes that make an element a document anchor. Put them inside a start tag: html`<li ${anchor('123')}>`. */
export function anchor(value: string | number): HtmlFragment {
  return raw(attr('data-adoc-anchor', String(value)));
}

/** Attributes that record the source position of an element, such as `TASK-a.md:12`. */
export function source(file: string, line: number): HtmlFragment {
  return raw(attr('data-adoc-source', `${file}:${line}`));
}

/**
 * Attributes that make an element an action control.
 * - `click`: put on a `<button>`.
 * - `toggle`: put on an `<input type="checkbox">`; the handler receives `checked`.
 * - `drag`: put on the dragged element; pair it with `dropTarget(name, value)` on each drop zone.
 */
export function action(spec: { kind: 'click' | 'toggle' | 'drag'; name: string; value?: string | number }): HtmlFragment {
  const parts = [attr('data-adoc-action', spec.name), attr('data-adoc-kind', spec.kind), attr('data-adoc-value', String(spec.value ?? ''))];
  if (spec.kind === 'drag') parts.push('draggable="true"');
  return raw(parts.join(' '));
}

/** Attributes that make an element a drop zone for the drag action `name`; the handler receives `value` as `to`. */
export function dropTarget(name: string, value: string | number): HtmlFragment {
  return raw(`${attr('data-adoc-drop', name)} ${attr('data-adoc-drop-value', String(value))}`);
}

/** A complete reference link to another document, such as `TASK-1231` or `TASK-1231#method`. */
export function ref(target: string, label?: string): HtmlFragment {
  return raw(`<a href="#" class="adoc-ref" ${attr('data-adoc-ref', target)}>${escapeHtml(label ?? target)}</a>`);
}

/** Turns heading text into an anchor value: `Completion Criteria` becomes `completion-criteria`. */
export function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
}
