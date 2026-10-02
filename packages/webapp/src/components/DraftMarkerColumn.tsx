import { Circle, Pencil, X } from 'lucide-react';
import { useLayoutEffect, useState } from 'react';
import { formatTarget, type Subject } from '../api.js';
import { draftStore, useDrafts, type DraftComment } from '../drafts.js';

interface Placed {
  draft: DraftComment;
  top: number;
}

/**
 * _Draft_Marker_Column_: a one-character margin with a dot beside each element that carries a draft of this
 * document; hovering a dot unfolds its card.
 */
export function DraftMarkerColumn({ subject, content, container, html, onEdit }: { subject: Subject; content: HTMLElement | null; container: HTMLElement | null; html: string; onEdit: (draft: DraftComment) => void }) {
  const drafts = useDrafts().filter((d) => formatTarget(d.target) === formatTarget(subject) || (d.target.level === 'anchor' && subject.level === 'document' && d.target.key === subject.key));
  const [placed, setPlaced] = useState<Placed[]>([]);
  const [open, setOpen] = useState<number>();

  useLayoutEffect(() => {
    if (!content || !container) return;
    const base = container.getBoundingClientRect();
    setPlaced(
      drafts.map((draft) => {
        let element: Element | null = null;
        if (draft.source) element = content.querySelector(`[data-adoc-source="${CSS.escape(draft.source)}"]`);
        if (!element && draft.target.level === 'anchor') element = content.querySelector(`[data-adoc-anchor="${CSS.escape(draft.target.anchor)}"]`);
        const rect = (element ?? content).getBoundingClientRect();
        return { draft, top: rect.top - base.top + 2 };
      }),
    );
  }, [drafts.map((d) => d.id).join(','), html, content, container]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="draft-marker-column" data-testid="draft-marker-column">
      {placed.map(({ draft, top }) => (
        <div key={draft.id} className="draft-marker" style={{ top }} onMouseEnter={() => setOpen(draft.id)} onMouseLeave={() => setOpen(undefined)}>
          <Circle />
          {open === draft.id && (
            <div className="draft-card floating">
              <div className="draft-card-target">{draft.target.level === 'anchor' ? `#${draft.target.anchor}` : formatTarget(subject)}</div>
              {draft.quote && <blockquote>{draft.quote}</blockquote>}
              <div>{draft.text}</div>
              <div className="draft-card-actions">
                <button className="quiet" title="Edit" onClick={() => onEdit(draft)}>
                  <Pencil />
                </button>
                <button className="quiet" title="Remove" onClick={() => draftStore.remove(draft.id)}>
                  <X />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
