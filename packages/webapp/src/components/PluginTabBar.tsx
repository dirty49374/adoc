import { NavLink } from 'react-router';
import { useWorkspace } from '../workspace.js';

/** _Plugin_Tab_Bar_: one tab per plugin in adoc.yaml order. */
export function PluginTabBar() {
  const workspace = useWorkspace();
  if (!workspace) return <nav className="plugin-tab-bar" />;
  return (
    <nav className="plugin-tab-bar" data-testid="plugin-tab-bar">
      {workspace.plugins.length === 0 && <span className="muted">No plugin is declared in .adoc/adoc.yaml.</span>}
      {workspace.plugins.map((p) => (
        <NavLink key={p.key} to={`/p/${p.key}`} className={({ isActive }: { isActive: boolean }) => `plugin-tab${isActive ? ' active' : ''}${p.error ? ' failed' : ''}`} title={p.error ?? p.description}>
          {p.key}
          <span className="count">{p.error ? '!' : p.documents}</span>
        </NavLink>
      ))}
    </nav>
  );
}
