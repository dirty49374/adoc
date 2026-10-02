import { useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { reportActivity } from '../live.js';
import { WorkspaceProvider, useWorkspace } from '../workspace.js';
import { ConnectionStatusLabel } from './ConnectionStatusLabel.js';
import { GitStatusLabel } from './GitStatusLabel.js';
import { MessageDock } from './MessageDock.js';
import { PluginTabBar } from './PluginTabBar.js';
import { WarningLink } from './WarningLink.js';
import { WarningPanel } from './WarningPanel.js';

/** _App_Shell_: top bar, plugin tabs, the routed main area and the message dock. */
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
  return (
    <div className="app-shell">
      <header className="top-bar">
        <Link to="/" className="workspace-name">
          adoc · {workspace?.name ?? '…'}
        </Link>
        <div className="top-bar-right">
          <WarningLink count={workspace?.check.length ?? 0} onOpen={() => setWarningsOpen(true)} />
          <ConnectionStatusLabel />
          {workspace && <GitStatusLabel git={workspace.git} />}
        </div>
      </header>
      <PluginTabBar />
      <div className="shell-body">
        <main className="shell-main">
          <Outlet />
        </main>
        <MessageDock />
      </div>
      {warningsOpen && <WarningPanel entries={workspace?.check ?? []} onClose={() => setWarningsOpen(false)} />}
    </div>
  );
}
