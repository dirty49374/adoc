import { useEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { usePinned } from '../fold.js';
import { useWorkspace } from '../workspace.js';
import { DocumentDetailPane } from './DocumentDetailPane.js';
import { DocumentListPane } from './DocumentListPane.js';
import { SkillView } from './SkillView.js';

/**
 * The `/p/:plugin`, `/p/:plugin/:document` and `/p/:plugin/skill` routes: the list pane, and beside it the detail pane
 * of the chosen document or the _Skill_View_ of the plugin's skill. While something is shown beside it, the list folds
 * into a rail unless the user pinned it.
 */
export function PluginRoute({ view }: { view?: 'skill' }) {
  const { pluginKey, documentKey } = useParams();
  const skill = useWorkspace()?.plugins.find((p) => p.key === pluginKey)?.skill;
  const [pinned, pin] = usePinned('adoc.list-pinned');
  const shown = Boolean(documentKey) || view === 'skill';
  const unpinned = shown && !pinned;
  // Held open after a plugin tab was chosen, until the pointer is over neither the tab bar nor the list pane.
  const [held, setHeld] = useState(false);
  useEffect(() => {
    const hold = () => setHeld(true);
    window.addEventListener('adoc:hold-list', hold);
    return () => window.removeEventListener('adoc:hold-list', hold);
  }, []);
  useEffect(() => {
    if (!held) return;
    const move = (e: PointerEvent) => {
      if (!(e.target as Element | null)?.closest?.('.plugin-tab-bar, .document-list-pane')) setHeld(false);
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  }, [held]);
  // The width the list pane takes from the main area, published as --adoc-main-inset so that the composer stays
  // centred on the reading column beside it (0 while the list is folded into its overlaying rail).
  const slot = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = slot.current;
    const shell = element?.closest<HTMLElement>('.shell-column');
    if (!element || !shell) return;
    const observer = new ResizeObserver(() => shell.style.setProperty('--adoc-main-inset', `${element.offsetWidth}px`));
    observer.observe(element);
    return () => {
      observer.disconnect();
      shell.style.removeProperty('--adoc-main-inset');
    };
  }, []);
  return (
    <div className={`plugin-route${unpinned ? ' list-unpinned' : ''}`}>
      <div className="document-list-slot" ref={slot}>
        <DocumentListPane pluginKey={pluginKey!} selected={documentKey} pinned={pinned} onPin={shown ? pin : undefined} unpinned={unpinned} held={held} openTop={!shown} />
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
