import { useState } from 'react';
import { useParams } from 'react-router';
import { readStored, writeStored } from '../storage.js';
import { DocumentDetailPane } from './DocumentDetailPane.js';
import { DocumentListPane } from './DocumentListPane.js';

/**
 * The `/p/:plugin` and `/p/:plugin/:document` routes: the list pane, and the detail pane when a document is chosen.
 * While a document is shown, the list folds into a rail unless the person pinned it.
 */
export function PluginRoute() {
  const { pluginKey, documentKey } = useParams();
  const [pinned, setPinned] = useState(() => readStored('adoc.list-pinned', false));
  const pin = (next: boolean) => {
    setPinned(next);
    writeStored('adoc.list-pinned', next || undefined);
  };
  return (
    <div className={`plugin-route${documentKey && !pinned ? ' folded' : ''}`}>
      <div className="document-list-slot">
        <DocumentListPane pluginKey={pluginKey!} selected={documentKey} pinned={pinned} onPin={documentKey ? pin : undefined} />
      </div>
      {documentKey ? <DocumentDetailPane key={documentKey} documentKey={documentKey} /> : <div className="pane-placeholder">Choose a document.</div>}
    </div>
  );
}
