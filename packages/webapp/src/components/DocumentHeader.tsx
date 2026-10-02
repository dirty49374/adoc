import type { DocumentView } from '../api.js';
import { ChangeBasePicker } from './ChangeBasePicker.js';
import { ChangeToggle } from './ChangeToggle.js';

interface Props {
  view: DocumentView;
  changeState: 'none' | 'available' | 'unavailable';
  changesOn: boolean;
  onToggleChanges: () => void;
  versions: Array<{ version: string; seenAt: string }>;
  base?: string;
  onPickBase: (version: string) => void;
}

/** _Document_Header_: key, title, status, file path, the _Change_Toggle_ and the _Change_Base_Picker_. */
export function DocumentHeader({ view, changeState, changesOn, onToggleChanges, versions, base, onPickBase }: Props) {
  return (
    <div className="document-header" data-testid="document-header">
      <div className="header-key">{view.key}</div>
      <h1 className="header-title">{view.summary?.title ?? view.key}</h1>
      <div className="header-meta">
        {view.summary ? <span className="status">{view.summary.status}</span> : <span className="adoc-chip adoc-tone-error">summary failed: {view.summaryError}</span>}
        <span className="path">{view.path}</span>
        <ChangeToggle state={changeState} on={changesOn} onToggle={onToggleChanges} />
        <ChangeBasePicker versions={versions} base={versions.some((v) => v.version === base) ? base : undefined} onPick={onPickBase} />
      </div>
    </div>
  );
}
