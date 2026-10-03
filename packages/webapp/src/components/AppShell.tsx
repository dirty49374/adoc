import { useCallback, useEffect, useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router';
import { HUB, currentRoute } from '../base.js';
import { reportActivity } from '../live.js';
import { WorkspaceProvider, useWorkspace } from '../workspace.js';
import { ConnectionStatusLabel } from './ConnectionStatusLabel.js';
import { AgentPaneLabel } from './AgentPaneLabel.js';
import { GitStatusLabel } from './GitStatusLabel.js';
import { HostSwitcher } from './HostSwitcher.js';
import { PanelResizer } from './PanelResizer.js';
import { readStored, writeStored } from '../storage.js';
import { useDrafts } from '../drafts.js';
import { CommentComposer } from './CommentComposer.js';
import { MessageDock } from './MessageDock.js';
import { PluginTabBar } from './PluginTabBar.js';
import { ThemeToggle } from './ThemeToggle.js';
import { WarningLink } from './WarningLink.js';
import { WarningPanel } from './WarningPanel.js';

/** _App_Shell_: the top bar with the plugin tabs, the routed main area with the composer below it, and the message dock. */
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
  useEffect(() => {
    reportActivity(current);
    // Where this browser was at this workspace, for returning to it from the _Host_Switcher_ under a hub.
    writeStored('last-location', current);
  }, [current]);
  useEffect(() => {
    let last = 0;
    const report = () => {
      if (Date.now() - last < 2000) return;
      last = Date.now();
      reportActivity(currentRoute());
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
  const drafts = useDrafts();
  useActivityReports();
  const [warningsOpen, setWarningsOpen] = useState(false);
  const [dockWidth, setDockWidth] = useState(() => readStored('dock-width', 420));
  const [dockLeft, setDockLeft] = useState(() => readStored('dock-left', false));
  const swap = () => {
    setDockLeft(!dockLeft);
    writeStored('dock-left', !dockLeft || undefined);
  };
  const resize = useCallback((width: number) => {
    setDockWidth(width);
    writeStored('dock-width', width);
  }, []);
  return (
    <div className="app-shell">
      <header className="top-bar">
        {HUB ? (
          <HostSwitcher />
        ) : (
          <Link to="/" className="workspace-name">
            <span className="product">adoc</span>
            {workspace?.name ?? '…'}
          </Link>
        )}
        <PluginTabBar />
        <div className="top-bar-right">
          <WarningLink count={workspace?.check.length ?? 0} onOpen={() => setWarningsOpen(true)} />
          <ConnectionStatusLabel />
          {workspace && <GitStatusLabel git={workspace.git} />}
          <AgentPaneLabel />
          <ThemeToggle />
        </div>
      </header>
      <div className={`shell-body${dockLeft ? ' dock-left' : ''}`}>
        <div className="shell-column">
          <main className="shell-main">
            <Outlet />
          </main>
          <CommentComposer drafts={drafts} />
        </div>
        <PanelResizer width={dockWidth} onWidth={resize} dockLeft={dockLeft} onSwap={swap} />
        <MessageDock width={dockWidth} dockLeft={dockLeft} />
      </div>
      {warningsOpen && <WarningPanel entries={workspace?.check ?? []} onClose={() => setWarningsOpen(false)} />}
    </div>
  );
}
