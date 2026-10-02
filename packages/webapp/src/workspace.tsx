import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, type WorkspaceInfo } from './api.js';
import { useLive } from './live.js';

const WorkspaceContext = createContext<WorkspaceInfo | undefined>(undefined);

/** Loads /api/workspace and reloads it whenever any document changes. */
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { revision } = useLive();
  const [info, setInfo] = useState<WorkspaceInfo>();
  useEffect(() => {
    let cancelled = false;
    api.workspace().then((w) => !cancelled && setInfo(w), () => undefined);
    return () => {
      cancelled = true;
    };
  }, [revision]);
  return <WorkspaceContext.Provider value={info}>{children}</WorkspaceContext.Provider>;
}

export function useWorkspace(): WorkspaceInfo | undefined {
  return useContext(WorkspaceContext);
}
