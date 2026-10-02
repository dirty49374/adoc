import { useParams } from 'react-router';
import { usePinned } from '../fold.js';
import { DocumentDetailPane } from './DocumentDetailPane.js';
import { DocumentListPane } from './DocumentListPane.js';

/**
 * The `/p/:plugin` and `/p/:plugin/:document` routes: the list pane, and the detail pane when a document is chosen.
 * While a document is shown, the list folds into a rail unless the person pinned it.
 */
export function PluginRoute() {
  const { pluginKey, documentKey } = useParams();
  const [pinned, pin] = usePinned('adoc.list-pinned');
  const unpinned = Boolean(documentKey) && !pinned;
  return (
    <div className={`plugin-route${unpinned ? ' list-unpinned' : ''}`}>
      <div className="document-list-slot">
        <DocumentListPane pluginKey={pluginKey!} selected={documentKey} pinned={pinned} onPin={documentKey ? pin : undefined} unpinned={unpinned} />
      </div>
      {documentKey ? <DocumentDetailPane key={documentKey} documentKey={documentKey} /> : <div className="pane-placeholder">Choose a document.</div>}
    </div>
  );
}
