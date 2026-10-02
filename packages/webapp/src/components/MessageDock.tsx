import { ChevronLeft, ChevronRight, Eye, Inbox, Keyboard, SquareTerminal } from 'lucide-react';
import { useState } from 'react';
import { useLive } from '../live.js';
import { PendingMessageList } from './PendingMessageList.js';
import { TerminalPanel, type TerminalPhase } from './TerminalPanel.js';

/**
 * _Message_Dock_: one header (agent, pane or transport, agent status, terminal control, pending count), then the
 * agent's terminal when a pane is claimed or the pending messages otherwise.
 */
export function MessageDock({ width, dockLeft }: { width: number; dockLeft: boolean }) {
  const { messages, agent } = useLive();
  const [collapsed, setCollapsed] = useState(false);
  const [phase, setPhase] = useState<TerminalPhase>('connecting');
  const claim = agent?.claim && !agent.claim.gone ? agent.claim : undefined;
  return (
    <aside className={`message-dock${collapsed ? ' collapsed' : ''}`} style={collapsed ? undefined : { width }} data-testid="message-dock">
      <div className="dock-header">
        {claim ? <SquareTerminal /> : <Inbox />}
        <span className="agent-name">{agent?.name ?? 'agent'}</span>
        {!collapsed && (
          <>
            <span className="where" title={claim ? `${claim.agent ?? 'pane'} in herdr session ${claim.herdrSession}` : 'Transport of the messages'}>
              {claim ? `${claim.pane} · ${claim.agent ?? 'pane'}` : `via ${agent?.transport ?? '…'}`}
            </span>
            {claim?.status && <span className={`agent-status ${claim.status}`}>{claim.status}</span>}
            <span className="spacer" />
            {claim && (
              <span className={`terminal-phase ${phase}`} title={phase === 'control' ? 'This tab controls the terminal' : phase === 'observe' ? 'Another tab controls the terminal; click it to take over' : phase}>
                {phase === 'control' ? <Keyboard /> : <Eye />}
              </span>
            )}
          </>
        )}
        <span className="adoc-chip" data-testid="pending-count" title="Messages not delivered yet">
          {messages.length}
        </span>
        <button className="quiet" onClick={() => setCollapsed(!collapsed)} title={collapsed ? 'Open the panel' : 'Fold the panel'}>
          {/* The arrow points to where the panel goes: toward its edge when folding, away from it when opening. */}
          {collapsed === dockLeft ? <ChevronRight /> : <ChevronLeft />}
        </button>
      </div>
      {!collapsed && (
        <>
          {claim ? <TerminalPanel claim={claim} onPhase={setPhase} /> : <PendingMessageList messages={messages} />}
          {agent?.claim?.gone && <p className="dock-note adoc-block adoc-tone-error">The claimed pane {agent.claim.pane} closed; messages are held until an agent claims the workspace again.</p>}
        </>
      )}
    </aside>
  );
}
