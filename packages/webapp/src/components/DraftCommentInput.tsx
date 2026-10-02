import { useEffect, useRef, useState } from 'react';
import { formatTarget, type Subject, type UserComment } from '../api.js';
import { draftStore } from '../drafts.js';
import { openComments } from '../openComments.js';

interface Props {
  /** The document or skill whose body holds the popover: the open comment is kept under it. */
  subject: Subject;
  comment: Omit<UserComment, 'text'>;
  initialText?: string;
  onDone: () => void;
}

/** _Draft_Comment_Input_: adds one draft comment for its popover's target; sends nothing. Typed text survives leaving the page. */
export function DraftCommentInput({ subject, comment, initialText, onDone }: Props) {
  const [text, setText] = useState(initialText ?? '');
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => area.current?.focus(), []);
  const update = (value: string) => {
    setText(value);
    openComments.set(formatTarget(subject), { ...comment, text: value });
  };
  const finish = () => {
    openComments.set(formatTarget(subject), undefined);
    onDone();
  };
  const add = () => {
    if (!text.trim()) return;
    draftStore.add({ ...comment, text });
    finish();
  };
  return (
    <div className="draft-comment-input" data-testid="draft-comment-input">
      <div className="composer-target">
        draft · <code>{formatTarget(comment.target)}</code>
        {comment.source && <span className="muted"> · {comment.source}</span>}
      </div>
      {comment.quote && <blockquote className="composer-quote">{comment.quote}</blockquote>}
      <textarea
        ref={area}
        value={text}
        rows={2}
        placeholder="Comment on this part"
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            add();
          }
          if (e.key === 'Escape') finish();
        }}
      />
      <div className="composer-actions">
        <button type="button" className="quiet" onClick={finish}>
          Cancel
        </button>
        <button type="button" className="primary" disabled={!text.trim()} onClick={add}>
          Add
        </button>
      </div>
    </div>
  );
}
