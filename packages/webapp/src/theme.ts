import { useSyncExternalStore } from 'react';
import { readStored, writeStored } from './storage.js';

/** A colour scheme choice; `system` follows the operating system. */
export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'adoc.theme';
const listeners = new Set<() => void>();
const root = document.documentElement;
/** The default of the _Adoc_Config_ (`ui.theme`), which the server writes into the page as `data-theme`. */
const configured: ThemeChoice = root.dataset.theme === 'light' || root.dataset.theme === 'system' ? root.dataset.theme : 'dark';
/** This browser's own choice, if the person made one. */
let chosen: ThemeChoice | undefined = readStored<ThemeChoice | undefined>(KEY, undefined);

const current = (): ThemeChoice => chosen ?? configured;

/** Applies the choice: the tokens use `light-dark()`, so `color-scheme` (set by `data-theme` in app.css) switches every colour. */
function apply(): void {
  root.dataset.theme = current();
}

const system = window.matchMedia('(prefers-color-scheme: dark)');
system.addEventListener('change', () => listeners.forEach((l) => l()));
apply();

export const themeStore = {
  get: current,
  set(next: ThemeChoice): void {
    chosen = next;
    writeStored(KEY, next);
    apply();
    listeners.forEach((l) => l());
  },
  /** Whether dark colours are showing now, after resolving `system`. */
  dark: (): boolean => (current() === 'system' ? system.matches : current() === 'dark'),
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
};

export function useThemeChoice(): ThemeChoice {
  return useSyncExternalStore(themeStore.subscribe, themeStore.get);
}

/** Resolves design tokens to concrete colours, for code that cannot use CSS, such as the xterm.js theme. */
export function resolveTokens<K extends string>(names: readonly K[]): Record<K, string> {
  const probe = document.createElement('span');
  probe.style.display = 'none';
  document.body.appendChild(probe);
  const out = {} as Record<K, string>;
  for (const name of names) {
    probe.style.color = `var(--adoc-${name})`;
    out[name] = getComputedStyle(probe).color;
  }
  probe.remove();
  return out;
}
