/**
 * What the server put into the page (_Web_UI_Base_): the base path, `/` when the browser connects directly or `/<host>/`
 * under a hub; the hub's discovery path, empty when no hub serves the page; and the workspace id that names storage keys.
 */
const meta = (name: string) => document.querySelector(`meta[name="${name}"]`)?.getAttribute('content') ?? '';
const declared = document.querySelector('base')?.getAttribute('href') ?? '/';

export const BASE = declared.startsWith('/') && !declared.includes('__') ? declared : '/';
export const HUB = meta('adoc-hub').startsWith('/') ? meta('adoc-hub') : '';
export const WORKSPACE_ID = /^[0-9a-f]{16}$/.test(meta('adoc-workspace')) ? meta('adoc-workspace') : 'default';

/** A server path such as `/api/workspace` under the base. */
export function under(path: string): string {
  return BASE + path.replace(/^\//, '');
}

/** The current route without the base, as the server and the router know it: `/p/NOTE/NOTE-x#ideas`. */
export function currentRoute(): string {
  const path = location.pathname.startsWith(BASE) ? `/${location.pathname.slice(BASE.length)}` : location.pathname;
  return path + location.hash;
}
