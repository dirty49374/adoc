import { Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatTarget, type EditResponse, type MessageTarget } from '../api.js';
import { draftStore } from '../drafts.js';

interface Props {
  /** What the edit draft is about: the document, or the skill. */
  target: MessageTarget;
  load: () => Promise<{ file: string; text: string; version: string }>;
  /** Sends the edited text; the detail pane runs it like an action, so that the saved version counts as shown. */
  onSave: (text: string, since: string, version: string) => Promise<EditResponse>;
  /** A sentence after the diff in the draft, such as what the agent should do next. */
  note?: string;
  onClose: () => void;
}

/**
 * _File_Editor_: a whole file as text, the main file of a document or the SKILL.md of a skill. Saving writes it at once
 * through the server and puts the target's one edit draft: the unified diff since the text before the first edit that
 * has not been sent.
 */
export function FileEditor({ target, load, onSave, note, onClose }: Props) {
  const [loaded, setLoaded] = useState<{ file: string; text: string; version: string }>();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'editing' | 'saving' | 'refused'>('editing');
  const [notice, setNotice] = useState<string>();
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    load().then((file) => {
      setLoaded(file);
      setText(file.text);
      requestAnimationFrame(() => area.current?.focus());
    }, (error: Error) => setNotice(error.message));
  }, [formatTarget(target)]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = async () => {
    if (!loaded || phase === 'saving') return;
    setPhase('saving');
    const since = draftStore.ownDraft('edit', target)?.base ?? loaded.text;
    const response = await onSave(text, since, loaded.version);
    if (response.status === 'refused') {
      setPhase('refused');
      setNotice(response.reason);
      return;
    }
    setLoaded({ ...loaded, text, version: response.version });
    if (response.diff) draftStore.putOwnDraft('edit', target, `I edited ${loaded.file}:\n\n\`\`\`diff\n${response.diff}\n\`\`\`${note ? `\n\n${note}` : ''}`, since);
    else draftStore.removeOwnDraft('edit', target);
    setPhase('editing');
    setNotice(response.diff ? 'Saved; the diff waits in the composer.' : 'Saved; the text is back to what the agent saw last.');
  };

  return (
    <div className="document-editor" data-testid="document-editor">
      <div className="editor-toolbar">
        <span className="path">{loaded?.file ?? formatTarget(target)}</span>
        {notice && <span className={`editor-notice${phase === 'refused' ? ' error' : ''}`}>{notice}</span>}
        <span className="spacer" />
        <button className="primary" onClick={() => void save()} disabled={!loaded || phase === 'saving' || text === loaded.text} title="Save (Ctrl+S)" data-testid="editor-save">
          <Save />
          {phase === 'saving' ? 'saving…' : 'save'}
        </button>
        <button className="quiet" onClick={onClose} title="Close the editor" data-testid="editor-close">
          <X />
        </button>
      </div>
      <textarea
        ref={area}
        className="editor-text"
        value={text}
        spellCheck={false}
        disabled={!loaded}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 's' && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            void save();
          }
          if (e.key === 'Escape') onClose();
        }}
      />
    </div>
  );
}
