import { Link } from 'react-router';
import { useWorkspace } from '../workspace.js';

/** _Workspace_Home_Panel_: each plugin with its key, document count and load error. */
export function WorkspaceHomePanel() {
  const workspace = useWorkspace();
  if (!workspace) return <div className="pane-placeholder">Loading…</div>;
  return (
    <div className="workspace-home" data-testid="workspace-home">
      <h1>{workspace.name}</h1>
      <p className="muted">{workspace.root}</p>
      <div className="plugin-cards">
        {workspace.plugins.map((p) => (
          <Link key={p.key} to={`/p/${p.key}`} className={`plugin-card${p.error ? ' failed' : ''}`}>
            <div className="plugin-card-key">{p.key}</div>
            <div className="plugin-card-count">{p.documents} documents</div>
            <div className="plugin-card-description">{p.error ? `Failed to load: ${p.error}` : p.description}</div>
            {p.layout && <div className="muted small">{p.layout}</div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
