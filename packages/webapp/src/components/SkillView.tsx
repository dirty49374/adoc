import { useEffect, useRef, useState } from 'react';
import { api, type SkillInfo } from '../api.js';
import { drawDiagrams } from '../diagrams.js';

type SkillState = { phase: 'loading' } | { phase: 'missing' } | { phase: 'showing'; skill: SkillInfo & { html: string } };

/** _Skill_View_: one agent skill read-only, its SKILL.md rendered like a document body, without editing or comments. */
export function SkillView({ name: skillName }: { name: string }) {
  const [state, setState] = useState<SkillState>({ phase: 'loading' });
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    setState({ phase: 'loading' });
    api.skill(skillName).then(
      (skill) => setState({ phase: 'showing', skill }),
      () => setState({ phase: 'missing' }),
    );
  }, [skillName]);
  useEffect(() => {
    if (state.phase === 'showing' && body.current) void drawDiagrams(body.current);
  }, [state]);

  if (state.phase === 'loading') return <div className="pane-placeholder">Loading…</div>;
  if (state.phase === 'missing') return <div className="pane-placeholder">No skill is named {skillName}.</div>;
  const { skill } = state;
  return (
    <section className="document-detail-pane main-scroll" data-testid="skill-view">
      <div className="document-header">
        <div className="header-key">SKILL.md · {skill.scope} scope</div>
        <h1 className="header-title">{skill.name}</h1>
        <div className="header-meta">
          <span className="muted">{skill.description}</span>
        </div>
      </div>
      <div className="document-body">
        <div className="rendered" translate="yes" ref={body} dangerouslySetInnerHTML={{ __html: skill.html }} />
      </div>
    </section>
  );
}
