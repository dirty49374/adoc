import { useEffect, useState } from 'react';
import { api, type SummaryEntry } from '../api.js';
import { PinButton } from '../fold.js';
import { useLive } from '../live.js';
import { DocumentRow } from './DocumentRow.js';

type ListState = { phase: 'loading' } | { phase: 'plugin-error'; error: string } | { phase: 'showing'; documents: SummaryEntry[] };

/** _Document_List_Pane_: one row per document of the plugin, ordered by key; `onPin` offers pinning while a document is shown. */
export function DocumentListPane({ pluginKey, selected, pinned, onPin, unpinned }: { pluginKey: string; selected?: string; pinned: boolean; onPin?: (pinned: boolean) => void; unpinned: boolean }) {
  const { revision } = useLive();
  const [state, setState] = useState<ListState>({ phase: 'loading' });
  useEffect(() => {
    let cancelled = false;
    api.documents(pluginKey).then(
      (body) => !cancelled && setState(body.error ? { phase: 'plugin-error', error: body.error } : { phase: 'showing', documents: body.documents }),
      (error: Error) => !cancelled && setState({ phase: 'plugin-error', error: error.message }),
    );
    return () => {
      cancelled = true;
    };
  }, [pluginKey, revision]);

  return (
    <aside className={`document-list-pane foldable${unpinned ? ' unpinned' : ''}`} data-testid="document-list-pane">
      <div className="pane-rail fold-closed">{pluginKey}</div>
      <div className="pane-title fold-open">
        {pluginKey}
        {onPin && <PinButton pinned={pinned} onPin={onPin} what="list" testId="list-pin" />}
      </div>
      <div className="document-rows main-scroll fold-open">
        {state.phase === 'loading' && <p className="muted">Loading…</p>}
        {state.phase === 'plugin-error' && <p className="error">Plugin {pluginKey} failed to load: {state.error}</p>}
        {state.phase === 'showing' && state.documents.length === 0 && <p className="muted">No {pluginKey} documents yet.</p>}
        {state.phase === 'showing' && state.documents.map((entry) => <DocumentRow key={entry.key} entry={entry} selected={entry.key === selected} />)}
      </div>
    </aside>
  );
}
