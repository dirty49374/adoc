import { useNavigate } from 'react-router';
import { formatTarget, pluginOf } from '../api.js';
import { draftStore, type DraftComment } from '../drafts.js';

/** _Draft_Chip_List_: one chip per draft across documents; a click opens its document at its marker. */
export function DraftChipList({ drafts }: { drafts: DraftComment[] }) {
  const navigate = useNavigate();
  if (drafts.length === 0) return null;
  const open = (d: DraftComment) => {
    if (d.target.level === 'document' || d.target.level === 'anchor') {
      const key = d.target.key;
      navigate(`/p/${pluginOf(key)}/${key}${d.target.level === 'anchor' ? `#${encodeURIComponent(d.target.anchor)}` : ''}`);
    } else if (d.target.level === 'plugin') navigate(`/p/${d.target.pluginKey}`);
    else navigate('/');
  };
  return (
    <div className="draft-chip-list" data-testid="draft-chip-list">
      {drafts.map((d) => (
        <span key={d.id} className="draft-chip" title={`${d.quote ? `"${d.quote}" — ` : ''}${d.text}`}>
          <button className="chip-label" onClick={() => open(d)}>
            {formatTarget(d.target).replace(/^[A-Z]+-[^#]*#/, '#')}
          </button>
          <button className="chip-remove" title="Remove this draft" onClick={() => draftStore.remove(d.id)}>
            ×
          </button>
        </span>
      ))}
    </div>
  );
}
