import { useParams } from 'react-router';
import { DocumentDetailPane } from './DocumentDetailPane.js';
import { DocumentListPane } from './DocumentListPane.js';

/** The `/p/:plugin` and `/p/:plugin/:document` routes: the list pane, and the detail pane when a document is chosen. */
export function PluginRoute() {
  const { pluginKey, documentKey } = useParams();
  return (
    <div className="plugin-route">
      <DocumentListPane pluginKey={pluginKey!} selected={documentKey} />
      {documentKey ? <DocumentDetailPane key={documentKey} documentKey={documentKey} /> : <div className="pane-placeholder">Choose a document.</div>}
    </div>
  );
}
