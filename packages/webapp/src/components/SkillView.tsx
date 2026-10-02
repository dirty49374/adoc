import { Pencil } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api, type SkillInfo } from '../api.js';
import { DocumentBody } from './DocumentBody.js';
import { FileEditor } from './FileEditor.js';

type SkillState = { phase: 'loading' } | { phase: 'missing' } | { phase: 'showing'; skill: SkillInfo & { html: string } };

/**
 * _Skill_View_: one agent skill, its SKILL.md in a _Document_Body_: comments on selected text and through the composer
 * target the skill; the edit button opens the _File_Editor_ on the SKILL.md.
 */
export function SkillView({ name }: { name: string }) {
  const [state, setState] = useState<SkillState>({ phase: 'loading' });
  const [editing, setEditing] = useState(false);
  const load = useCallback(() => {
    api.skill(name).then(
      (skill) => setState({ phase: 'showing', skill }),
      () => setState({ phase: 'missing' }),
    );
  }, [name]);
  useEffect(() => {
    setState({ phase: 'loading' });
    setEditing(false);
    load();
  }, [load]);

  if (state.phase === 'loading') return <div className="pane-placeholder">Loading…</div>;
  if (state.phase === 'missing') return <div className="pane-placeholder">No skill is named {name}.</div>;
  const { skill } = state;
  return (
    <section className="document-detail-pane main-scroll" data-testid="skill-view">
      <div className="document-header">
        <div className="header-key">SKILL.md · {skill.scope} scope</div>
        <h1 className="header-title">{skill.name}</h1>
        <div className="header-meta">
          <span className="muted">{skill.description}</span>
          {!editing && (
            <button className="quiet" onClick={() => setEditing(true)} title="Edit the SKILL.md; the diff goes to the agent with your next message" data-testid="edit-button">
              <Pencil />
              edit
            </button>
          )}
        </div>
      </div>
      {editing ? (
        <FileEditor
          target={{ level: 'skill', name }}
          load={() => api.skillFile(name)}
          onSave={(text, since, version) => api.editSkillFile(name, { version, text, since })}
          note="Run adoc skill update so that the agents get the new skill."
          onClose={() => {
            setEditing(false);
            load();
          }}
        />
      ) : (
        <DocumentBody subject={{ level: 'skill', name }} html={skill.html} />
      )}
    </section>
  );
}
