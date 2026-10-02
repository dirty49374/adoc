import type { PublicMessage } from '../api.js';

/** _Pending_Message_List_: one row per held message, by number; empty when the agent has received everything. */
export function PendingMessageList({ messages }: { messages: PublicMessage[] }) {
  if (messages.length === 0) return <p className="muted pending-empty">The agent has received everything.</p>;
  return (
    <ol className="pending-message-list" data-testid="pending-message-list">
      {messages.map((m) => (
        <li key={m.number} className={`pending-message ${m.kind}`} title={m.formatted}>
          <div className="pending-head">
            <span className="number">#{m.number}</span>
            <span className="kind">{m.kind}</span>
            {m.target && <code>{m.target}</code>}
            {m.kind === 'action' && <span className="muted">{m.applied ? 'applied' : 'request'}</span>}
          </div>
          {m.text && <div className="pending-text">{m.text}</div>}
          {m.comments?.map((c, i) => (
            <div key={i} className="pending-comment">
              <code>{c.target}</code>
              {c.quote && <blockquote>{c.quote}</blockquote>}
              <div className="pending-text">{c.text}</div>
            </div>
          ))}
        </li>
      ))}
    </ol>
  );
}
