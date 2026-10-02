import type { MessageTarget, Subject } from '../api.js';
import { DraftCommentInput } from './DraftCommentInput.js';

export interface PopoverRequest {
  target: MessageTarget;
  quote?: string;
  source?: string;
  text?: string;
  top: number;
  left: number;
}

/** _Comment_Popover_: holds the draft input for one anchor or one selection until it is added or cancelled. */
export function CommentPopover({ subject, request, onClose }: { subject: Subject; request: PopoverRequest; onClose: () => void }) {
  const comment: { target: MessageTarget; quote?: string; source?: string } = { target: request.target };
  if (request.quote) comment.quote = request.quote;
  if (request.source) comment.source = request.source;
  const props: Parameters<typeof DraftCommentInput>[0] = { subject, comment, onDone: onClose };
  if (request.text) props.initialText = request.text;
  return (
    <div className="comment-popover floating" style={{ top: request.top, left: request.left }} data-testid="comment-popover" onMouseUp={(e) => e.stopPropagation()}>
      <DraftCommentInput {...props} />
    </div>
  );
}
