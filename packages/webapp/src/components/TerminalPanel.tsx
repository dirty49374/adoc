import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import { useEffect, useRef, useState } from 'react';
import { onTerminal, sendTerminal, useLive, type AgentInfo } from '../live.js';

type Phase = 'connecting' | 'observe' | 'control' | 'closed';

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
 * re-opens its stream every few seconds to get a fresh full frame.
 */
export function TerminalPanel({ claim }: { claim: NonNullable<AgentInfo['claim']> }) {
  const { connection } = useLive();
  const host = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<Phase>('connecting');
  const mode = useRef<'observe' | 'control'>('observe');

  useEffect(() => {
    const element = host.current;
    if (!element) return;
    const term = new Terminal({ fontSize: 12.5, fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace', cursorBlink: true, allowProposedApi: true, scrollback: 0, theme: { background: '#14171c' } });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(element);
    fit.fit();
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
        setPhase(mode.current);
      } else if (message.type === 'terminal.closed') {
        setPhase('closed');
      }
    });
    const data = term.onData((text) => {
      if (mode.current === 'control') sendTerminal({ type: 'terminal.input', data: text });
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
    let pending = 0;
    let flush: number | undefined;
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      takeControl();
      pending += e.deltaMode === 1 ? -e.deltaY : -e.deltaY / 40;
      if (flush === undefined) {
        flush = window.setTimeout(() => {
          const lines = Math.trunc(pending) || Math.sign(pending);
          pending = 0;
          flush = undefined;
          if (lines) sendTerminal({ type: 'terminal.scroll', lines: lines * 3 });
        }, 50);
      }
    };
    element.addEventListener('wheel', wheel, { passive: false, capture: true });
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
      data.dispose();
      observer.disconnect();
      textarea?.removeEventListener('focus', takeControl);
      window.removeEventListener('pointerdown', takeControl, true);
      window.removeEventListener('keydown', takeControl, true);
      window.removeEventListener('focus', takeControl);
      window.clearInterval(refresh);
      window.removeEventListener('adoc:panel-resized', resized);
      element.removeEventListener('wheel', wheel, { capture: true });
      sendTerminal({ type: 'terminal.close' });
      term.dispose();
    };
  }, [claim.pane, claim.herdrSession, connection]);

  return (
    <div className="terminal-panel" data-testid="terminal-panel">
      <div className="terminal-header">
        <span>
          ▣ <strong>{claim.pane}</strong>
          <span className="muted"> · {claim.agent ?? 'pane'} · {claim.herdrSession}</span>
        </span>
        <span className={`terminal-phase ${phase}`}>{phase === 'control' ? '⌨ this tab controls the terminal' : phase === 'observe' ? 'observing · another tab controls · click to take over' : phase}</span>
        <span className={`agent-status ${claim.status ?? ''}`}>{claim.status ?? ''}</span>
      </div>
      <div className="terminal-host" ref={host} />
    </div>
  );
}
