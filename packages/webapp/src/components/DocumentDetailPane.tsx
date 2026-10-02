import { useCallback, useEffect, useRef, useState } from 'react';
import { api, HttpError, type ActionRequest, type ActionResponse, type DocumentView } from '../api.js';
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

  // A change that this browser's own action caused is not a change for the person: while an action runs, a change
  // notice waits for the reply (the server announces the change before it replies), and the reply's version counts
  // as seen.
  const inFlight = useRef(0);
  const reloadAfterAction = useRef(false);
  useEffect(load, [load]);
  useEffect(() => {
    if (!changed.keys.includes(documentKey) && !changed.keys.includes('*')) return;
    if (inFlight.current) reloadAfterAction.current = true;
    else load();
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

  // The version the next action is sent with: the shown one, or the one an applied action returned before the reload.
  const version = useRef<string | undefined>(undefined);
  if (state.phase === 'showing') version.current ??= state.view.version;
  useEffect(() => {
    if (state.phase === 'showing') version.current = state.view.version;
  }, [state]);

  const onAction = async (request: Omit<ActionRequest, 'key' | 'version'>): Promise<ActionResponse | undefined> => {
    if (!version.current) return undefined;
    inFlight.current += 1;
    let response: ActionResponse;
    try {
      response = await api.sendAction({ ...request, key: documentKey, version: version.current });
      if (response.status === 'applied' && response.version) seenVersions.set(documentKey, response.version);
    } finally {
      inFlight.current -= 1;
      if (!inFlight.current && reloadAfterAction.current) {
        reloadAfterAction.current = false;
        load();
      }
    }
    if (response.status === 'refused') {
      setNotice(`Refused: ${response.reason}`);
      load();
    } else if (response.status === 'failed') {
      setNotice(`The action failed: ${response.error}`);
      load();
    } else {
      if (response.version) version.current = response.version;
      setNotice(undefined);
    }
    return response;
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
    <section className="document-detail-pane main-scroll" data-testid="document-detail-pane">
      <DocumentHeader view={view} changeState={changeState} changesOn={showChanges} onToggleChanges={() => void toggle()} versions={versions} base={base.current} onPickBase={(v) => void pick(v)} onArchive={(name) => void onAction({ event: { kind: 'click', name, value: '' } })} />
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
