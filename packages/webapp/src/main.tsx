import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider } from 'react-router';
import { AppShell } from './components/AppShell.js';
import { PluginRoute } from './components/PluginRoute.js';
import { SkillView } from './components/SkillView.js';
import { WorkspaceHomePanel } from './components/WorkspaceHomePanel.js';
import { LiveProvider } from './live.js';

const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: WorkspaceHomePanel },
      { path: 'p/:pluginKey', Component: PluginRoute },
      { path: 'p/:pluginKey/:documentKey', Component: PluginRoute },
      { path: 'skills/:skillName', Component: SkillView },
    ],
  },
]);

const navigate = (location: string) => void router.navigate(location);

createRoot(document.getElementById('root')!).render(
  <LiveProvider onNavigate={navigate}>
    <RouterProvider router={router} />
  </LiveProvider>,
);
