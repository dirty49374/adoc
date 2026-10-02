import { formatTarget } from '../api.js';
import { draftStore, type DraftComment } from '../drafts.js';

/** _Draft_Comment_List_: drafts not sent yet, in the order added; hidden when empty. */
export function DraftCommentList({ drafts }: { drafts: DraftComment[] }) {
  if (drafts.length === 0) return null;
  return (
    <div className="draft-comment-list" data-testid="draft-comment-list">
      <div className="draft-title">
        {drafts.length} draft {drafts.length === 1 ? 'comment' : 'comments'}, sent with the next message
      </div>
      <ol>
        {drafts.map((d) => (
          <li key={d.id}>
            <div className="pending-head">
              <code>{formatTarget(d.target)}</code>
              <button className="remove" title="Remove this draft" onClick={() => draftStore.remove(d.id)}>
                ×
              </button>
            </div>
            {d.quote && <blockquote>{d.quote}</blockquote>}
            <div className="pending-text">{d.text}</div>
          </li>
        ))}
      </ol>
    </div>
  );
}
