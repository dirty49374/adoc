import { useParams } from 'react-router';
import { usePinned } from '../fold.js';
import { useWorkspace } from '../workspace.js';
import { DocumentDetailPane } from './DocumentDetailPane.js';
import { DocumentListPane } from './DocumentListPane.js';
import { SkillView } from './SkillView.js';

/**
 * The `/p/:plugin`, `/p/:plugin/:document` and `/p/:plugin/skill` routes: the list pane, and beside it the detail pane
 * of the chosen document or the _Skill_View_ of the plugin's skill. While something is shown beside it, the list folds
 * into a rail unless the person pinned it.
 */
export function PluginRoute({ view }: { view?: 'skill' }) {
  const { pluginKey, documentKey } = useParams();
  const skill = useWorkspace()?.plugins.find((p) => p.key === pluginKey)?.skill;
  const [pinned, pin] = usePinned('adoc.list-pinned');
  const shown = Boolean(documentKey) || view === 'skill';
  const unpinned = shown && !pinned;
  return (
    <div className={`plugin-route${unpinned ? ' list-unpinned' : ''}`}>
      <div className="document-list-slot">
        <DocumentListPane pluginKey={pluginKey!} selected={documentKey} pinned={pinned} onPin={shown ? pin : undefined} unpinned={unpinned} />
      </div>
      {view === 'skill' ? (
        skill ? <SkillView name={skill} /> : <div className="pane-placeholder">{pluginKey} has no agent skill.</div>
      ) : documentKey ? (
        <DocumentDetailPane key={documentKey} documentKey={documentKey} />
      ) : (
        <div className="pane-placeholder">Choose a document.</div>
      )}
    </div>
  );
}
