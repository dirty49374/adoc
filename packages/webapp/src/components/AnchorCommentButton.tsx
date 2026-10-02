import { MessageSquarePlus } from 'lucide-react';

/** _Anchor_Comment_Button_: appears beside a hovered anchor and opens the _Comment_Popover_ for it. */
export function AnchorCommentButton({ top, left, anchor, onOpen }: { top: number; left: number; anchor: string; onOpen: () => void }) {
  return (
    <button
      className="anchor-comment-button floating"
      style={{ top, left }}
      title={`Comment on #${anchor}`}
      data-testid="anchor-comment-button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onOpen}
    >
      <MessageSquarePlus />
    </button>
  );
}
