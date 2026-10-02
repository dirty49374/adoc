import { Monitor, Moon, Sun } from 'lucide-react';
import { themeStore, useThemeChoice, type ThemeChoice } from '../theme.js';

const NEXT: Record<ThemeChoice, ThemeChoice> = { system: 'light', light: 'dark', dark: 'system' };
const ICON = { system: Monitor, light: Sun, dark: Moon };

/** _Theme_Toggle_: cycles the colour scheme through system, light and dark; the choice is kept per browser. */
export function ThemeToggle() {
  const choice = useThemeChoice();
  const Icon = ICON[choice];
  return (
    <button className="theme-toggle" onClick={() => themeStore.set(NEXT[choice])} title={`Colours: ${choice} (click for ${NEXT[choice]})`} data-testid="theme-toggle">
      <Icon />
    </button>
  );
}
