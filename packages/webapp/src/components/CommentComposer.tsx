import { SendHorizontal } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams } from 'react-router';
import { api, formatTarget, type MessageTarget, type UserComment } from '../api.js';
import { draftStore, type DraftComment } from '../drafts.js';
import { readStored, writeStored } from '../storage.js';

const TEXT_KEY = 'adoc.composer';

/** The targets the route allows, narrowest first: document, plugin, workspace. */
function routeTargets(pluginKey?: string, documentKey?: string): MessageTarget[] {
  const targets: MessageTarget[] = [];
  if (documentKey) targets.push({ level: 'document', key: documentKey });
  if (pluginKey) targets.push({ level: 'plugin', pluginKey });
  targets.push({ level: 'workspace' });
  return targets;
}

/**
 * _Comment_Composer_: the one composer. Sends every draft plus its own text on the chosen target
 * as one comment message; clears only after the server accepted. The input starts with three lines and grows with its text.
 */
export function CommentComposer({ drafts }: { drafts: DraftComment[] }) {
  const { pluginKey, documentKey } = useParams();
  const targets = routeTargets(pluginKey, documentKey);
  const [chosen, setChosen] = useState(0);
  const [text, setText] = useState(() => readStored(TEXT_KEY, ''));
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  useEffect(() => setChosen(0), [pluginKey, documentKey]);
  const area = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const element = area.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [text]);
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
    const comments: UserComment[] = drafts.map(({ id: _id, ...comment }) => comment);
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
    <div className="comment-composer" data-testid="comment-composer">
      <div className="composer-target">
        {targets.map((t, i) => (
          <button key={formatTarget(t)} className={`adoc-chip mono${t === target ? ' active' : ''}`} onClick={() => setChosen(i)} title="Target of the message you type here">
            {formatTarget(t)}
          </button>
        ))}
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
  );
}
