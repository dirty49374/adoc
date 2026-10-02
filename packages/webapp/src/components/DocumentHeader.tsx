import type { DocumentView } from '../api.js';
import { ChangeToggle } from './ChangeToggle.js';

interface Props {
  view: DocumentView;
  changeState: 'none' | 'available' | 'unavailable';
  changesOn: boolean;
  onToggleChanges: () => void;
}

/** _Document_Header_: key, title, status, file path and the _Change_Toggle_. */
export function DocumentHeader({ view, changeState, changesOn, onToggleChanges }: Props) {
  return (
    <div className="document-header" data-testid="document-header">
      <div className="header-key">{view.key}</div>
      <h1 className="header-title">{view.summary?.title ?? view.key}</h1>
      <div className="header-meta">
        {view.summary ? <span className="badge">{view.summary.status}</span> : <span className="badge error">summary failed: {view.summaryError}</span>}
        <span className="muted">{view.path}</span>
        <ChangeToggle state={changeState} on={changesOn} onToggle={onToggleChanges} />
      </div>
    </div>
  );
}
