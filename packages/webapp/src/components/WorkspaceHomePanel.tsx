import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { api, type SkillInfo } from '../api.js';
import { useWorkspace } from '../workspace.js';

/** _Workspace_Home_Panel_: each plugin with its key, document count and load error; links to adoc's own agent skills. */
export function WorkspaceHomePanel() {
  const workspace = useWorkspace();
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  useEffect(() => {
    api.skills().then((r) => setSkills(r.skills.filter((s) => !s.pluginKey)), () => setSkills([]));
  }, []);
  if (!workspace) return <div className="pane-placeholder">Loading…</div>;
  return (
    <div className="workspace-home main-scroll" data-testid="workspace-home">
      <h1>{workspace.name}</h1>
      <p className="root">{workspace.root}</p>
      {skills.length > 0 && (
        <p className="home-skills">
          {skills.map((s) => (
            <Link key={s.name} className="skill-link" to={`/skills/${s.name}`} title={s.description}>
              {s.name} SKILL.md
            </Link>
          ))}
        </p>
      )}
      <div className="plugin-cards">
        {workspace.plugins.map((p) => (
          <Link key={p.key} to={`/p/${p.key}`} className={`plugin-card adoc-block${p.error ? ' failed' : ''}`}>
            <div className="plugin-card-key">{p.key}</div>
            <div className="plugin-card-count">{p.documents} documents</div>
            <div className="plugin-card-description">{p.error ? `Failed to load: ${p.error}` : p.description}</div>
            {p.layout && <div className="muted small mono">{p.layout}</div>}
          </Link>
        ))}
      </div>
    </div>
  );
}
