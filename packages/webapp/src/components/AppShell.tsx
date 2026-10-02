import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { reportActivity } from '../live.js';
import { WorkspaceProvider, useWorkspace } from '../workspace.js';
import { ConnectionStatusLabel } from './ConnectionStatusLabel.js';
import { AgentPaneLabel } from './AgentPaneLabel.js';
import { GitStatusLabel } from './GitStatusLabel.js';
import { PanelResizer } from './PanelResizer.js';
import { readStored, writeStored } from '../storage.js';
import { MessageDock } from './MessageDock.js';
import { PluginTabBar } from './PluginTabBar.js';
import { ThemeToggle } from './ThemeToggle.js';
import { WarningLink } from './WarningLink.js';
import { WarningPanel } from './WarningPanel.js';

/** _App_Shell_: the top bar with the plugin tabs, the routed main area and the message dock. */
export function AppShell() {
  return (
    <WorkspaceProvider>
      <ShellLayout />
    </WorkspaceProvider>
  );
}

/** Reports every navigation, click, key press and focus as an access of this _Browser_Session_. */
function useActivityReports() {
  const where = useLocation();
  const current = where.pathname + where.hash;
  useEffect(() => reportActivity(current), [current]);
  useEffect(() => {
    let last = 0;
    const report = () => {
      if (Date.now() - last < 2000) return;
      last = Date.now();
      reportActivity(location.pathname + location.hash);
    };
    window.addEventListener('click', report, true);
    window.addEventListener('keydown', report, true);
    window.addEventListener('focus', report);
    return () => {
      window.removeEventListener('click', report, true);
      window.removeEventListener('keydown', report, true);
      window.removeEventListener('focus', report);
    };
  }, []);
}

function ShellLayout() {
  const workspace = useWorkspace();
  useActivityReports();
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [dockWidth, setDockWidth] = useState(() => readStored('adoc.dock-width', 420));
  const resize = useCallback((width: number) => {
    setDockWidth(width);
    writeStored('adoc.dock-width', width);
  }, []);
  return (
    <div className="app-shell">
      <header className="top-bar">
        <Link to="/" className="workspace-name">
          <span className="product">adoc</span>
          {workspace?.name ?? '…'}
        </Link>
        <PluginTabBar />
        <div className="top-bar-right">
          <WarningLink count={workspace?.check.length ?? 0} onOpen={() => setWarningsOpen(true)} />
          <ConnectionStatusLabel />
          {workspace && <GitStatusLabel git={workspace.git} />}
          <AgentPaneLabel />
          <ThemeToggle />
        </div>
      </header>
      <div className="shell-body">
        <main className="shell-main">
          <Outlet />
        </main>
        <PanelResizer width={dockWidth} onWidth={resize} />
        <MessageDock width={dockWidth} />
      </div>
      {warningsOpen && <WarningPanel entries={workspace?.check ?? []} onClose={() => setWarningsOpen(false)} />}
    </div>
  );
}
