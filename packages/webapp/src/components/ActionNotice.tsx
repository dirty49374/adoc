/** _Action_Notice_: the outcome of the last refused or failed action. */
export function ActionNotice({ text, onDismiss }: { text: string; onDismiss: () => void }) {
  return (
    <div className="action-notice" role="alert" data-testid="action-notice">
      <span>{text}</span>
      <button className="secondary" onClick={onDismiss}>
        Dismiss
      </button>
    </div>
  );
}
