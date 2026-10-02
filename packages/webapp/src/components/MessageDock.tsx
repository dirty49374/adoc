import { useState } from 'react';
import { useDrafts } from '../drafts.js';
import { useLive } from '../live.js';
import { CommentComposer } from './CommentComposer.js';
import { DraftChipList } from './DraftChipList.js';
import { PendingMessageList } from './PendingMessageList.js';
import { TerminalPanel } from './TerminalPanel.js';

/** _Message_Dock_: the agent's terminal when a pane is claimed, otherwise the pending messages; drafts and the composer at the bottom. */
export function MessageDock({ width }: { width: number }) {
  const { messages, agent } = useLive();
  const drafts = useDrafts();
  const [collapsed, setCollapsed] = useState(false);
  const claim = agent?.claim && !agent.claim.gone ? agent.claim : undefined;
  return (
    <aside className={`message-dock${collapsed ? ' collapsed' : ''}`} style={collapsed ? undefined : { width }} data-testid="message-dock">
      <button className="dock-header" onClick={() => setCollapsed(!collapsed)}>
        <span>
          {claim ? 'Agent terminal' : 'Messages to'} <strong>{agent?.name ?? 'agent'}</strong>
          <span className="muted"> via {agent?.transport ?? '…'}</span>
        </span>
        <span className="badge" data-testid="pending-count" title="Messages not delivered yet">
          ⧗ {messages.length}
        </span>
      </button>
      {!collapsed && (
        <>
          {claim ? <TerminalPanel claim={claim} /> : <PendingMessageList messages={messages} />}
          {agent?.claim?.gone && <p className="error small dock-note">The claimed pane {agent.claim.pane} closed; messages are held until an agent claims the workspace again.</p>}
          <DraftChipList drafts={drafts} />
          <CommentComposer drafts={drafts} />
        </>
      )}
    </aside>
  );
}
