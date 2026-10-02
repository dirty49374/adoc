import { X } from 'lucide-react';

/** _Action_Notice_: the outcome of the last refused or failed action. */
export function ActionNotice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div className="action-notice adoc-block adoc-tone-warning" role="alert" data-testid="action-notice">
      <span>{text}</span>
      <button className="quiet" onClick={onDismiss} title="Dismiss">
        <X />
      </button>
    </div>
  );
}
