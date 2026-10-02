import { useState } from 'react';
import { useDrafts } from '../drafts.js';
import { useLive } from '../live.js';
import { useWorkspace } from '../workspace.js';
import { CommentComposer } from './CommentComposer.js';
import { DraftCommentList } from './DraftCommentList.js';
import { PendingMessageList } from './PendingMessageList.js';

/** _Message_Dock_: undelivered messages, then drafts, then the one composer. */
export function MessageDock() {
  const { messages } = useLive();
  const drafts = useDrafts();
  const workspace = useWorkspace();
  const [collapsed, setCollapsed] = useState(false);
  return (
    <aside className={`message-dock${collapsed ? ' collapsed' : ''}`} data-testid="message-dock">
      <button className="dock-header" onClick={() => setCollapsed(!collapsed)}>
        <span>
          Messages to <strong>{workspace?.agent.name ?? 'agent'}</strong>
          <span className="muted"> via {workspace?.agent.transport ?? '…'}</span>
        </span>
        <span className="badge" data-testid="pending-count">
          {messages.length}
          {drafts.length ? ` · ${drafts.length} draft` : ''}
        </span>
      </button>
      {!collapsed && (
        <>
          <PendingMessageList messages={messages} />
          <DraftCommentList drafts={drafts} />
          <CommentComposer drafts={drafts} />
        </>
      )}
    </aside>
  );
}
