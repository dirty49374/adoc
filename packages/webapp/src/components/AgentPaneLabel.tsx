import { useLive } from '../live.js';

/** _Agent_Pane_Label_: the assigned agent's herdr pane and status, or "no agent". */
export function AgentPaneLabel() {
  const { agent } = useLive();
  const claim = agent?.claim;
  if (!claim) return <span className="agent-pane-label none" data-testid="agent-pane-label" title="Run adoc agent claim in the agent's pane">▣ no agent</span>;
  return (
    <span className={`agent-pane-label${claim.gone ? ' gone' : ''}`} data-testid="agent-pane-label" title={`${claim.agent ?? 'agent'} in herdr session ${claim.herdrSession}`}>
      ▣ {claim.pane} {claim.gone ? 'gone' : claim.status ?? ''}
    </span>
  );
}
