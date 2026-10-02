import { Pin, PinOff } from 'lucide-react';
import { useEffect, useState } from 'react';
import { api, type SummaryEntry } from '../api.js';
import { useLive } from '../live.js';
import { DocumentRow } from './DocumentRow.js';

type ListState = { phase: 'loading' } | { phase: 'plugin-error'; error: string } | { phase: 'showing'; documents: SummaryEntry[] };

/** _Document_List_Pane_: one row per document of the plugin, ordered by key; `onPin` offers pinning while a document is shown. */
export function DocumentListPane({ pluginKey, selected, pinned, onPin }: { pluginKey: string; selected?: string; pinned: boolean; onPin?: (pinned: boolean) => void }) {
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
    <aside className="document-list-pane" data-testid="document-list-pane">
      <div className="pane-title">
        {pluginKey}
        {onPin && (
          <button className="quiet" onClick={() => onPin(!pinned)} title={pinned ? 'Fold the list while a document is shown' : 'Keep the list open'} data-testid="list-pin">
            {pinned ? <PinOff /> : <Pin />}
          </button>
        )}
      </div>
      <div className="document-rows">
        {state.phase === 'loading' && <p className="muted">Loading…</p>}
        {state.phase === 'plugin-error' && <p className="error">Plugin {pluginKey} failed to load: {state.error}</p>}
        {state.phase === 'showing' && state.documents.length === 0 && <p className="muted">No {pluginKey} documents yet.</p>}
        {state.phase === 'showing' && state.documents.map((entry) => <DocumentRow key={entry.key} entry={entry} selected={entry.key === selected} />)}
      </div>
    </aside>
  );
}
