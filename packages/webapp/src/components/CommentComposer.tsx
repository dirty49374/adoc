import { MessageSquare, SendHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useMatch, useParams } from 'react-router';
import { api, formatTarget, type MessageTarget, type UserComment } from '../api.js';
import { draftStore, sentComment, type DraftComment } from '../drafts.js';
import { PinButton, usePinned } from '../fold.js';
import { readStored, writeStored } from '../storage.js';
import { useWorkspace } from '../workspace.js';
import { DraftChipList } from './DraftChipList.js';

const TEXT_KEY = 'adoc.composer';

/** The targets the route allows, narrowest first: document or skill, plugin, workspace. */
function routeTargets(pluginKey?: string, documentKey?: string, skill?: string): MessageTarget[] {
  const targets: MessageTarget[] = [];
  if (documentKey) targets.push({ level: 'document', key: documentKey });
  if (skill) targets.push({ level: 'skill', name: skill });
  if (pluginKey) targets.push({ level: 'plugin', pluginKey });
  targets.push({ level: 'workspace' });
  return targets;
}

/**
 * _Comment_Composer_: the one composer. Sends every draft plus its own text on the chosen target
 * as one comment message; clears only after the server accepted. The input starts with three lines and grows with its text.
 * It floats over the bottom of the main area; unpinned, it folds into one line (see fold.tsx), keeping text and drafts.
 * Its open height is published as `--adoc-composer-space` so that the main area leaves room for it.
 */
export function CommentComposer({ drafts }: { drafts: DraftComment[] }) {
  const { pluginKey, documentKey } = useParams();
  // On a skill view the skill is the narrowest target: the plugin's skill at /p/:plugin/skill, or /skills/:name.
  const plugins = useWorkspace()?.plugins ?? [];
  const onPluginSkill = useMatch('/p/:pluginKey/skill') !== null;
  const standaloneSkill = useMatch('/skills/:skillName')?.params.skillName;
  const skill = onPluginSkill ? plugins.find((p) => p.key === pluginKey)?.skill : standaloneSkill;
  const targets = routeTargets(pluginKey, documentKey, skill);
  const [chosen, setChosen] = useState(0);
  const [text, setText] = useState(() => readStored(TEXT_KEY, ''));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const [pinned, pin] = usePinned('adoc.composer-pinned');
  useEffect(() => setChosen(0), [pluginKey, documentKey, skill]);
  const area = useRef<HTMLTextAreaElement>(null);
  const box = useRef<HTMLDivElement>(null);
  /** Grows the input with its text; a folded (hidden) input is measured again when it unfolds. */
  const grow = () => {
    const element = area.current;
    if (!element || element.offsetParent === null) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  };
  useLayoutEffect(grow, [text, pinned]);
  /**
   * Publishes the height of the open composer, also while it is folded, so that unfolding never covers the end of the
   * main area. A folded composer is measured open but invisible (`measuring`) when no open height is known yet.
   */
  const measure = () => {
    const element = box.current;
    const shell = element?.parentElement;
    if (!element || !shell) return;
    const open = element.querySelector<HTMLElement>(':scope > .fold-open');
    if (!open?.offsetHeight) {
      element.classList.add('measuring');
      grow();
    }
    shell.style.setProperty('--adoc-composer-space', `${element.offsetHeight}px`);
    element.classList.remove('measuring');
  };
  useEffect(() => {
    if (!box.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(box.current);
    return () => observer.disconnect();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  useLayoutEffect(measure, [pinned]); // eslint-disable-line react-hooks/exhaustive-deps
  const target = targets[Math.min(chosen, targets.length - 1)]!;

  const update = (value: string) => {
    writeStored(TEXT_KEY, value || undefined);
    setText(value);
  };
  const canSend = (text.trim() !== '' || drafts.length > 0) && !sending;

  const send = async () => {
    if (!canSend) return;
    setSending(true);
    setError(undefined);
    const comments: UserComment[] = drafts.map(sentComment);
    try {
      await api.sendComments(text.trim() ? { target, text, comments } : { comments });
      draftStore.clear(drafts.map((d) => d.id));
      update('');
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  return (
    <div ref={box} className={`composer-area foldable${pinned ? '' : ' unpinned'}`} onPointerEnter={grow} onFocus={grow}>
      <button className="composer-folded fold-closed" onClick={() => area.current?.focus()} data-testid="composer-folded">
        <MessageSquare />
        <span>Message to the agent</span>
        {drafts.length > 0 && <span className="adoc-chip adoc-tone-secondary">{drafts.length} {drafts.length === 1 ? 'draft' : 'drafts'}</span>}
        {text.trim() && <span className="adoc-chip">text typed</span>}
      </button>
      <div className="fold-open">
        <DraftChipList drafts={drafts} />
        <div className="comment-composer" data-testid="comment-composer">
          <div className="composer-target">
            {targets.map((t, i) => (
              <button key={formatTarget(t)} className={`adoc-chip mono${t === target ? ' active' : ''}`} onClick={() => setChosen(i)} title="Target of the message you type here">
                {formatTarget(t)}
              </button>
            ))}
            <span className="spacer" />
            <PinButton pinned={pinned} onPin={pin} what="composer" testId="composer-pin" />
          </div>
          <div className="composer-row">
            <textarea
              ref={area}
              value={text}
              rows={3}
              placeholder={drafts.length ? `Optional message about ${formatTarget(target)}` : `Message about ${formatTarget(target)}`}
              onChange={(e) => update(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  void send();
                }
              }}
            />
            <button
              type="button"
              className="primary send-button"
              disabled={!canSend}
              onClick={() => void send()}
              title={`${drafts.length ? `Send with ${drafts.length} ${drafts.length === 1 ? 'draft' : 'drafts'}` : 'Send'} (Ctrl+Enter)`}
              data-testid="composer-send"
            >
              <SendHorizontal />
            </button>
          </div>
          {error && <div className="error small">{error}</div>}
        </div>
      </div>
    </div>
  );
}
