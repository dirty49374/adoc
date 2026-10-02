import { Archive, ArchiveRestore, Pencil } from 'lucide-react';
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
  /** Triggers the _Document_Action_ `archive` or `unarchive`. */
  onArchive: (name: 'archive' | 'unarchive') => void;
  /** Whether the _Document_Editor_ is open, and how to open it. */
  editing: boolean;
  onEdit: () => void;
}

/** _Document_Header_: key, title, status, archived mark, file path, the _Change_Toggle_, the _Change_Base_Picker_, and the edit and archive buttons. */
export function DocumentHeader({ view, changeState, changesOn, onToggleChanges, versions, base, onPickBase, onArchive, editing, onEdit }: Props) {
  return (
    <div className="document-header" data-testid="document-header">
      <div className="header-key">{view.key}</div>
      <h1 className="header-title">{view.summary?.title ?? view.key}</h1>
      <div className="header-meta">
        {view.summary ? <span className="status">{view.summary.status}</span> : <span className="adoc-chip adoc-tone-error">summary failed: {view.summaryError}</span>}
        {view.archived && <span className="adoc-chip adoc-tone-accent">archived</span>}
        <span className="path">{view.path}</span>
        <ChangeToggle state={changeState} on={changesOn} onToggle={onToggleChanges} />
        <ChangeBasePicker versions={versions} base={versions.some((v) => v.version === base) ? base : undefined} onPick={onPickBase} />
        {!editing && (
          <button className="quiet" onClick={onEdit} title="Edit the whole file; the diff goes to the agent with your next message" data-testid="edit-button">
            <Pencil />
            edit
          </button>
        )}
        <button className="quiet" onClick={() => onArchive(view.archived ? 'unarchive' : 'archive')} title={view.archived ? 'Ask the agent to restore this document' : 'Ask the agent to archive this document'} data-testid="archive-button">
          {view.archived ? <ArchiveRestore /> : <Archive />}
          {view.archived ? 'unarchive' : 'archive'}
        </button>
      </div>
    </div>
  );
}
