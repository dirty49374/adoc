import { useEffect, useRef, useState } from 'react';

interface Props {
  question: string;
  /** Called with whether the user checked "don't ask again". */
  onConfirm: (dontAskAgain: boolean) => void;
  onCancel: () => void;
}

/**
 * _Action_Confirm_Dialog_: asks the user to confirm an action whose control carries `data-adoc-confirm`.
 * Escape and a click outside cancel; nothing is sent then.
 */
export function ActionConfirmDialog({ question, onConfirm, onCancel }: Props) {
  const [dontAskAgain, setDontAskAgain] = useState(false);
  const confirm = useRef<HTMLButtonElement>(null);

  const cancel = useRef(onCancel);
  cancel.current = onCancel;

  useEffect(() => {
    confirm.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  return (
    <div className="action-confirm-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onCancel()}>
      <div className="action-confirm-dialog adoc-block adoc-tone-primary" role="dialog" aria-modal="true" data-testid="action-confirm-dialog">
        <p>{question}</p>
        <label className="adoc-muted">
          <input type="checkbox" checked={dontAskAgain} onChange={(e) => setDontAskAgain(e.target.checked)} /> Don't ask again
        </label>
        <div className="action-confirm-buttons">
          <button className="quiet" onClick={onCancel}>
            Cancel
          </button>
          <button className="primary" ref={confirm} onClick={() => onConfirm(dontAskAgain)}>
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
