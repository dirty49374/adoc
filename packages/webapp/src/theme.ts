import { useSyncExternalStore } from 'react';
import { readStored, writeStored } from './storage.js';

/** The person's choice of colour scheme; `system` follows the operating system. */
export type ThemeChoice = 'system' | 'light' | 'dark';

const KEY = 'adoc.theme';
const listeners = new Set<() => void>();
let choice: ThemeChoice = readStored<ThemeChoice>(KEY, 'system');

/** Applies the choice: the tokens use `light-dark()`, so `color-scheme` alone switches every colour. */
function apply(): void {
  if (choice === 'system') delete document.documentElement.dataset.theme;
  else document.documentElement.dataset.theme = choice;
}

const system = window.matchMedia('(prefers-color-scheme: dark)');
system.addEventListener('change', () => listeners.forEach((l) => l()));
apply();

export const themeStore = {
  get: (): ThemeChoice => choice,
  set(next: ThemeChoice): void {
    choice = next;
    writeStored(KEY, next === 'system' ? undefined : next);
    apply();
    listeners.forEach((l) => l());
  },
  /** Whether dark colours are showing now, after resolving `system`. */
  dark: (): boolean => (choice === 'system' ? system.matches : choice === 'dark'),
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
