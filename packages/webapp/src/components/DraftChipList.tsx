import { useNavigate } from 'react-router';
import { formatTarget, pluginOf, skillRoute } from '../api.js';
import { useWorkspace } from '../workspace.js';
import { draftStore, type DraftComment } from '../drafts.js';

/** _Draft_Chip_List_: one chip per draft across documents; a click opens its document at its marker. */
export function DraftChipList({ drafts }: { drafts: DraftComment[] }) {
  const navigate = useNavigate();
  const plugins = useWorkspace()?.plugins ?? [];
  if (drafts.length === 0) return null;
  const open = (d: DraftComment) => {
    if (d.target.level === 'document' || d.target.level === 'anchor') {
      const key = d.target.key;
      navigate(`/p/${pluginOf(key)}/${key}${d.target.level === 'anchor' ? `#${encodeURIComponent(d.target.anchor)}` : ''}`);
    } else if (d.target.level === 'plugin') navigate(`/p/${d.target.pluginKey}`);
    else if (d.target.level === 'skill') navigate(skillRoute(d.target.name, plugins));
    else navigate('/');
  };
  return (
    <div className="draft-chip-list" data-testid="draft-chip-list">
      {drafts.map((d) => (
        <span key={d.id} className="adoc-chip draft-chip" title={`${d.quote ? `"${d.quote}" — ` : ''}${d.text}`}>
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
