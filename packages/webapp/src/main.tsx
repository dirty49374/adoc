import { createRoot } from 'react-dom/client';
import { createBrowserRouter, RouterProvider, useParams } from 'react-router';
import { AppShell } from './components/AppShell.js';
import { PluginRoute } from './components/PluginRoute.js';
import { SkillView } from './components/SkillView.js';
import { WorkspaceHomePanel } from './components/WorkspaceHomePanel.js';
import { BASE } from './base.js';
import { LiveProvider } from './live.js';

/** `/skills/:name`: the _Skill_View_ of a skill that belongs to no plugin, as the whole main area. */
function StandaloneSkill() {
  return <SkillView name={useParams().skillName!} />;
}

const router = createBrowserRouter([
  {
    path: '/',
    Component: AppShell,
    children: [
      { index: true, Component: WorkspaceHomePanel },
      { path: 'p/:pluginKey', Component: PluginRoute },
      { path: 'p/:pluginKey/skill', element: <PluginRoute view="skill" /> },
      { path: 'p/:pluginKey/:documentKey', Component: PluginRoute },
      { path: 'skills/:skillName', Component: StandaloneSkill },
    ],
  },
], { basename: BASE.replace(/\/$/, '') || '/' });

const navigate = (location: string) => void router.navigate(location);

createRoot(document.getElementById('root')!).render(
  <LiveProvider onNavigate={navigate}>
    <RouterProvider router={router} />
  </LiveProvider>,
);
