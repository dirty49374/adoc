import { Archive } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type SummaryEntry } from '../api.js';
import { PinButton } from '../fold.js';
import { useLive } from '../live.js';
import { useWorkspace } from '../workspace.js';
import { readStored, writeStored } from '../storage.js';
import { useClock } from '../time.js';
import { DocumentRow } from './DocumentRow.js';
import { DocumentSortPicker, isDocumentSort, sortEntries, type DocumentSort } from './DocumentSortPicker.js';

const SORT_KEY = 'adoc.list-sort';

type ListState = { phase: 'loading' } | { phase: 'plugin-error'; error: string } | { phase: 'showing'; documents: SummaryEntry[] };

/**
 * _Document_List_Pane_: one row per document of the plugin, in the order this browser chose (last update first by default),
 * without archived documents unless the archive button shows only them; `onPin` offers pinning while a document is shown.
 */
export function DocumentListPane({ pluginKey, selected, pinned, onPin, unpinned }: { pluginKey: string; selected?: string; pinned: boolean; onPin?: (pinned: boolean) => void; unpinned: boolean }) {
  const skill = useWorkspace()?.plugins.find((p) => p.key === pluginKey)?.skill;
  const { revision } = useLive();
  const [state, setState] = useState<ListState>({ phase: 'loading' });
  const [sort, setSort] = useState<DocumentSort>(() => {
    const stored = readStored<unknown>(SORT_KEY, 'updated');
    return isDocumentSort(stored) ? stored : 'updated';
  });
  const now = useClock();
  const [archive, setArchive] = useState(false);
  useEffect(() => setArchive(false), [pluginKey]);
  const pickSort = (next: DocumentSort) => {
    setSort(next);
    writeStored(SORT_KEY, next);
  };
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

  const shown = state.phase === 'showing' ? state.documents.filter((d) => d.archived === archive) : [];

  return (
    <aside className={`document-list-pane foldable${unpinned ? ' unpinned' : ''}`} data-testid="document-list-pane">
      <div className="pane-rail fold-closed">{pluginKey}</div>
      <div className="pane-title fold-open">
        <span className="pane-title-name">
          {archive ? `${pluginKey} · ARCHIVE` : pluginKey}
          {skill && (
            <Link className="skill-link" to={`/skills/${skill}`} title={`The agent skill of ${pluginKey}: how the agent works with these documents`} data-testid="skill-link">
              SKILL.md
            </Link>
          )}
        </span>
        <span className="pane-title-controls">
          <DocumentSortPicker sort={sort} onPick={pickSort} />
          <button className={`quiet${archive ? ' active' : ''}`} onClick={() => setArchive(!archive)} title={archive ? 'Back to the documents' : 'Show only archived documents'} data-testid="list-archive">
            <Archive />
          </button>
          {onPin && <PinButton pinned={pinned} onPin={onPin} what="list" testId="list-pin" />}
        </span>
      </div>
      <div className="document-rows main-scroll fold-open">
        {state.phase === 'loading' && <p className="muted">Loading…</p>}
        {state.phase === 'plugin-error' && <p className="error">Plugin {pluginKey} failed to load: {state.error}</p>}
        {state.phase === 'showing' && shown.length === 0 && <p className="muted">{archive ? `No archived ${pluginKey} documents.` : `No ${pluginKey} documents yet.`}</p>}
        {state.phase === 'showing' && sortEntries(shown, sort).map((entry) => <DocumentRow key={entry.key} entry={entry} selected={entry.key === selected} now={now} />)}
      </div>
    </aside>
  );
}
