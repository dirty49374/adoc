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
 * _Terminal_Panel_: the live terminal of the claimed herdr pane. Observes by default;
 * focusing it takes control, so keys (including input-method composition) and the size go to the pane.
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
    const off = onTerminal((message) => {
      if (message.type === 'terminal.frame' && typeof message.bytes === 'string') {
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
    const wheel = (e: WheelEvent) => {
      if (mode.current !== 'control') return;
      e.preventDefault();
      sendTerminal({ type: 'terminal.scroll', lines: Math.sign(e.deltaY) * -3 });
    };
    element.addEventListener('wheel', wheel, { passive: false });
    let timer: number | undefined;
    const observer = new ResizeObserver(() => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        fit.fit();
        sendTerminal({ type: 'terminal.resize', cols: term.cols, rows: term.rows });
      }, 120);
    });
    observer.observe(element);
    open('observe');
    return () => {
      off();
      data.dispose();
      observer.disconnect();
      textarea?.removeEventListener('focus', takeControl);
      element.removeEventListener('wheel', wheel);
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
        <span className={`terminal-phase ${phase}`}>{phase === 'control' ? '⌨ controlling' : phase === 'observe' ? 'click to type' : phase}</span>
        <span className={`agent-status ${claim.status ?? ''}`}>{claim.status ?? ''}</span>
      </div>
      <div className="terminal-host" ref={host} />
    </div>
  );
}
