import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef } from 'react';
import { onTerminal, sendTerminal, useLive, type AgentInfo } from '../live.js';
import { resolveTokens, themeStore } from '../theme.js';

export type TerminalPhase = 'connecting' | 'observe' | 'control' | 'closed';

const TOKENS = ['surface', 'text', 'text-muted', 'primary', 'border', 'surface-element', 'error', 'success', 'warning', 'secondary', 'accent', 'info'] as const;

/** The xterm.js theme from the design tokens, so the terminal follows light and dark like the rest of the page. */
function terminalTheme() {
  const t = resolveTokens(TOKENS);
  const ansi = { black: t['surface-element'], red: t.error, green: t.success, yellow: t.warning, blue: t.secondary, magenta: t.accent, cyan: t.info, white: t['text-muted'] };
  return {
    background: t.surface,
    foreground: t.text,
    cursor: t.primary,
    cursorAccent: t.surface,
    selectionBackground: t.border,
    ...ansi,
    brightBlack: t['text-muted'],
    brightRed: t.error,
    brightGreen: t.success,
    brightYellow: t.warning,
    brightBlue: t.secondary,
    brightMagenta: t.accent,
    brightCyan: t.info,
    brightWhite: t.text,
  };
}

const FONT = '"D2Coding", "Symbols Nerd Font Mono", ui-monospace, monospace';

/** Loads the bundled monospace fonts (regular and bold, with Hangul) once; later terminals reuse the promise. */
let monoFonts: Promise<unknown> | undefined;
function monoFontsReady(): Promise<unknown> {
  monoFonts ??= Promise.all(['13px "D2Coding"', 'bold 13px "D2Coding"', '13px "Symbols Nerd Font Mono"'].map((font) => document.fonts.load(font, 'a가\ue0b0'))).catch(() => undefined);
  return monoFonts;
}

function decode(base64: string): Uint8Array {
  const text = atob(base64);
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}

/**
 * _Terminal_Panel_: the live terminal of the claimed herdr pane. The tab the person is using controls it
 * (taken on load when focused, and on any click, key press or focus in the page), so keys and the size go
 * to the pane. Other tabs observe; herdr's observe stream can lag for agent panes, so an idle observer
 * re-opens its stream every few seconds to get a fresh full frame. The phase goes to the _Message_Dock_ header.
 */
export function TerminalPanel({ claim, onPhase }: { claim: NonNullable<AgentInfo['claim']>; onPhase: (phase: TerminalPhase) => void }) {
  const { connection } = useLive();
  const host = useRef<HTMLDivElement>(null);
  const mode = useRef<'observe' | 'control'>('observe');

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    /** Opens the terminal in the element and wires it to the stream; returns the cleanup. */
    const attach = () => {
      const term = new Terminal({ fontSize: 13, fontFamily: FONT, cursorBlink: true, allowProposedApi: true, scrollback: 0, theme: terminalTheme() });
      const fit = new FitAddon();
      term.loadAddon(fit);
      term.open(element);
      fit.fit();
      const offTheme = themeStore.subscribe(() => {
        term.options.theme = terminalTheme();
      });
      const open = (wanted: 'observe' | 'control') => {
        mode.current = wanted;
        sendTerminal({ type: 'terminal.open', mode: wanted, cols: term.cols, rows: term.rows });
      };
      let lastFrame = Date.now();
      const off = onTerminal((message) => {
        if (message.type === 'terminal.frame' && typeof message.bytes === 'string') {
          lastFrame = Date.now();
          if (message.full) term.reset();
          term.write(decode(message.bytes));
        } else if (message.type === 'terminal.mode') {
          mode.current = message.mode === 'control' ? 'control' : 'observe';
          onPhase(mode.current);
        } else if (message.type === 'terminal.closed') {
          onPhase('closed');
        }
      });
      const data = term.onData((text) => {
        if (mode.current === 'control') sendTerminal({ type: 'terminal.input', data: text });
      });
      // xterm.js sends Shift+Enter as a plain Enter, which submits the agent's input. Send ESC CR instead, the Alt+Enter
      // sequence that coding agents (Claude Code, Codex) take as a new line.
      term.attachCustomKeyEventHandler((e) => {
        if (e.key !== 'Enter' || !e.shiftKey || e.ctrlKey || e.altKey || e.metaKey) return true;
        if (e.type === 'keydown' && mode.current === 'control') sendTerminal({ type: 'terminal.input', data: '\x1b\r' });
        return false;
      });
      const textarea = element.querySelector('textarea');
      const takeControl = () => {
        if (mode.current !== 'control') open('control');
      };
      textarea?.addEventListener('focus', takeControl);
      window.addEventListener('pointerdown', takeControl, true);
      window.addEventListener('keydown', takeControl, true);
      window.addEventListener('focus', takeControl);
      const refresh = window.setInterval(() => {
        if (mode.current === 'observe' && Date.now() - lastFrame > 3000) open('observe');
      }, 1000);
      const resized = () => {
        fit.fit();
        open('control');
      };
      window.addEventListener('adoc:panel-resized', resized);
      // The wheel scrolls the pane's scrollback through herdr. Catch it before xterm.js, which would otherwise
      // turn it into arrow keys for full-screen apps and move the agent's input instead of the screen.
      // One wheel notch (100 px, or 3 lines in line mode) scrolls 10 lines; touchpad deltas add up; sent once per frame.
      let pending = 0;
      let flush: number | undefined;
      const wheel = (e: WheelEvent) => {
        e.preventDefault();
        e.stopPropagation();
        takeControl();
        pending += e.deltaMode === 1 ? (-e.deltaY * 10) / 3 : -e.deltaY / 10;
        if (flush === undefined) {
          flush = window.requestAnimationFrame(() => {
            const lines = Math.trunc(pending);
            pending -= lines;
            flush = undefined;
            if (lines) sendTerminal({ type: 'terminal.scroll', lines });
          });
        }
      };
      element.addEventListener('wheel', wheel, { passive: false, capture: true });
      // Mouse buttons go to the pane as 0-based cells; herdr passes them on when the program tracks the mouse.
      const BUTTONS = ['left', 'middle', 'right'] as const;
      let held: (typeof BUTTONS)[number] | undefined;
      let lastCell = '';
      const cell = (e: MouseEvent) => {
        const screen = element.querySelector('.xterm-screen')?.getBoundingClientRect();
        if (!screen || e.clientX < screen.left || e.clientY < screen.top || e.clientX >= screen.right || e.clientY >= screen.bottom) return undefined;
        return { column: Math.floor(((e.clientX - screen.left) / screen.width) * term.cols), row: Math.floor(((e.clientY - screen.top) / screen.height) * term.rows) };
      };
      const mouse = (action: 'down' | 'up' | 'drag', e: MouseEvent, button: (typeof BUTTONS)[number]) => {
        const at = cell(e);
        if (!at || mode.current !== 'control') return;
        const key = `${action}:${at.column}:${at.row}`;
        if (action === 'drag' && key === lastCell) return;
        lastCell = key;
        sendTerminal({ type: 'terminal.mouse', action, button, ...at });
      };
      const down = (e: MouseEvent) => {
        held = BUTTONS[e.button] ?? 'left';
        takeControl();
        mouse('down', e, held);
      };
      const move = (e: MouseEvent) => {
        if (held) mouse('drag', e, held);
      };
      const up = (e: MouseEvent) => {
        if (!held) return;
        mouse('up', e, held);
        held = undefined;
      };
      element.addEventListener('mousedown', down, true);
      window.addEventListener('mousemove', move, true);
      window.addEventListener('mouseup', up, true);
      let timer: number | undefined;
      const observer = new ResizeObserver(() => {
        window.clearTimeout(timer);
        timer = window.setTimeout(() => {
          fit.fit();
          sendTerminal({ type: 'terminal.resize', cols: term.cols, rows: term.rows });
        }, 120);
      });
      observer.observe(element);
      open(document.hasFocus() ? 'control' : 'observe');
      return () => {
        off();
        offTheme();
        data.dispose();
        observer.disconnect();
        textarea?.removeEventListener('focus', takeControl);
        window.removeEventListener('pointerdown', takeControl, true);
        window.removeEventListener('keydown', takeControl, true);
        window.removeEventListener('focus', takeControl);
        window.clearInterval(refresh);
        window.removeEventListener('adoc:panel-resized', resized);
        element.removeEventListener('wheel', wheel, { capture: true });
        element.removeEventListener('mousedown', down, true);
        window.removeEventListener('mousemove', move, true);
        window.removeEventListener('mouseup', up, true);
        sendTerminal({ type: 'terminal.close' });
        term.dispose();
      };
    };
    // xterm.js measures its cells when it opens: open it only once the bundled monospace fonts are there, or the
    // cells keep the fallback font's width and the IME composition drifts further right with every character.
    let detach: (() => void) | undefined;
    let cancelled = false;
    void monoFontsReady().then(() => {
      if (!cancelled) detach = attach();
    });
    return () => {
      cancelled = true;
      detach?.();
    };
  }, [claim.pane, claim.herdrSession, connection]);

  return (
    <div className="terminal-panel" data-testid="terminal-panel">
      <div className="terminal-host" ref={host} />
    </div>
  );
}
