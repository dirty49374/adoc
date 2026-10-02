import { Pencil } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { api, type SkillInfo } from '../api.js';
import { drawDiagrams } from '../diagrams.js';
import { FileEditor } from './FileEditor.js';

type SkillState = { phase: 'loading' } | { phase: 'missing' } | { phase: 'showing'; skill: SkillInfo & { html: string } };

/**
 * _Skill_View_: one agent skill, its SKILL.md rendered like a document body. Comments go through the composer (the
 * skill is its narrowest target); the edit button opens the _File_Editor_ on the SKILL.md.
 */
export function SkillView({ name }: { name: string }) {
  const [state, setState] = useState<SkillState>({ phase: 'loading' });
  const [editing, setEditing] = useState(false);
  const body = useRef<HTMLDivElement>(null);
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
  useEffect(() => {
    if (state.phase === 'showing' && body.current) void drawDiagrams(body.current);
  }, [state, editing]);

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
        <div className="document-body">
          <div className="rendered" translate="yes" ref={body} dangerouslySetInnerHTML={{ __html: skill.html }} />
        </div>
      )}
    </section>
  );
}
