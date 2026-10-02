import { useCallback, useEffect, useRef, useState } from 'react';
import { api, HttpError, type ActionRequest, type DocumentView } from '../api.js';
import { useLive } from '../live.js';
import { seenVersions } from '../storage.js';
import { ActionNotice } from './ActionNotice.js';
import { DocumentBody } from './DocumentBody.js';
import { DocumentHeader } from './DocumentHeader.js';

type DetailState = { phase: 'loading' } | { phase: 'missing' } | { phase: 'failed'; error: string } | { phase: 'showing'; view: DocumentView };

/**
 * _Document_Detail_Pane_: header, action notice and body. The changes since the version this browser
 * showed last are shown automatically; turning them off marks the current version as seen.
 */
export function DocumentDetailPane({ documentKey }: { documentKey: string }) {
  const { changed } = useLive();
  const [state, setState] = useState<DetailState>({ phase: 'loading' });
  const [notice, setNotice] = useState<string>();
  const [changesOn, setChangesOn] = useState(false);
  const base = useRef<string | undefined>(undefined);
  const [versions, setVersions] = useState<Array<{ version: string; seenAt: string }>>([]);

  const load = useCallback(() => {
    const seen = seenVersions.get(documentKey);
    api.document(documentKey, seen).then(
      (view) => {
        if (seen && seen !== view.version) {
          base.current = seen;
          setChangesOn(true);
        } else {
          seenVersions.set(documentKey, view.version);
        }
        setState({ phase: 'showing', view });
        api.versions(documentKey).then((r) => setVersions(r.versions.filter((v) => !v.current)), () => setVersions([]));
      },
      (error: Error) => setState(error instanceof HttpError && error.status === 404 ? { phase: 'missing' } : { phase: 'failed', error: error.message }),
    );
  }, [documentKey]);

  useEffect(load, [load]);
  useEffect(() => {
    if (changed.keys.includes(documentKey) || changed.keys.includes('*')) load();
  }, [changed.tick]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = async () => {
    if (state.phase !== 'showing') return;
    if (changesOn) {
      seenVersions.set(documentKey, state.view.version);
      setChangesOn(false);
    } else if (base.current) {
      const view = await api.document(documentKey, base.current);
      setState({ phase: 'showing', view });
      setChangesOn(true);
    }
  };

  const pick = async (version: string) => {
    base.current = version;
    const view = await api.document(documentKey, version);
    setState({ phase: 'showing', view });
    setChangesOn(true);
  };

  const onAction = async (request: Omit<ActionRequest, 'key' | 'version'>) => {
    if (state.phase !== 'showing') return;
    const response = await api.sendAction({ ...request, key: documentKey, version: state.view.version });
    if (response.status === 'refused') {
      setNotice(`Refused: ${response.reason}`);
      load();
    } else if (response.status === 'failed') {
      setNotice(`The action failed: ${response.error}`);
      load();
    } else {
      setNotice(undefined);
    }
  };

  if (state.phase === 'loading') return <section className="document-detail-pane pane-placeholder">Loading…</section>;
  if (state.phase === 'missing') return <section className="document-detail-pane pane-placeholder">{documentKey} no longer exists.</section>;
  if (state.phase === 'failed') return <section className="document-detail-pane pane-placeholder error">{state.error}</section>;
  const { view } = state;
  const changes = view.changes;
  const changeState = !base.current ? 'none' : changes && !changes.available ? 'unavailable' : 'available';
  const showChanges = changesOn && changes?.available === true;
  const html = showChanges ? changes.html : view.html;
  return (
    <section className="document-detail-pane" data-testid="document-detail-pane">
      <DocumentHeader view={view} changeState={changeState} changesOn={showChanges} onToggleChanges={() => void toggle()} versions={versions} base={base.current} onPickBase={(v) => void pick(v)} />
      {notice && <ActionNotice text={notice} onDismiss={() => setNotice(undefined)} />}
      {showChanges && changes.error && <ActionNotice text={`renderChanges failed: ${changes.error}`} onDismiss={() => undefined} />}
      {html !== undefined ? (
        <DocumentBody documentKey={documentKey} html={html} onAction={onAction} />
      ) : (
        <div className="document-body parse-error" data-testid="render-error">
          <div className="adoc-block adoc-tone-error">
            <strong>{view.pluginKey} could not render this document.</strong>
            <pre>{view.renderError}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
