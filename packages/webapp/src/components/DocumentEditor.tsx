import { Save, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { api, type EditResponse } from '../api.js';
import { draftStore } from '../drafts.js';

interface Props {
  documentKey: string;
  /** Sends the edited text; the detail pane runs it like an action, so the saved version counts as shown. */
  onSave: (text: string, since: string, version: string) => Promise<EditResponse>;
  onClose: () => void;
}

/**
 * _Document_Editor_: the whole main file as text. Saving writes it at once through the server and puts the document's
 * one edit draft: the unified diff since the text before the first edit that has not been sent.
 */
export function DocumentEditor({ documentKey, onSave, onClose }: Props) {
  const [loaded, setLoaded] = useState<{ file: string; text: string; version: string }>();
  const [text, setText] = useState('');
  const [phase, setPhase] = useState<'editing' | 'saving' | 'refused'>('editing');
  const [notice, setNotice] = useState<string>();
  const area = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    api.file(documentKey).then((file) => {
      setLoaded(file);
      setText(file.text);
      requestAnimationFrame(() => area.current?.focus());
    }, (error: Error) => setNotice(error.message));
  }, [documentKey]);

  const save = async () => {
    if (!loaded || phase === 'saving') return;
    setPhase('saving');
    const since = draftStore.documentDraft('edit', documentKey)?.base ?? loaded.text;
    const response = await onSave(text, since, loaded.version);
    if (response.status === 'refused') {
      setPhase('refused');
      setNotice(response.reason);
      return;
    }
    setLoaded({ ...loaded, text, version: response.version });
    if (response.diff) draftStore.putDocumentDraft('edit', documentKey, `I edited ${loaded.file}:\n\n\`\`\`diff\n${response.diff}\n\`\`\``, since);
    else draftStore.removeDocumentDraft('edit', documentKey);
    setPhase('editing');
    setNotice(response.diff ? 'Saved; the diff waits in the composer.' : 'Saved; the text is back to what the agent saw last.');
  };

  return (
    <div className="document-editor" data-testid="document-editor">
      <div className="editor-toolbar">
        <span className="path">{loaded?.file ?? documentKey}</span>
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
