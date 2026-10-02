import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PublicMessage } from './api.js';
import { sessionId } from './storage.js';

export interface LiveState {
  status: 'connecting' | 'connected' | 'disconnected';
  /** Increases whenever any document changes. */
  revision: number;
  /** Keys reported by the last change event, with a counter so that equal key lists still trigger effects. */
  changed: { keys: string[]; tick: number };
  messages: PublicMessage[];
}

const initial: LiveState = { status: 'connecting', revision: 0, changed: { keys: [], tick: 0 }, messages: [] };
const LiveContext = createContext<LiveState>(initial);
let socket: WebSocket | undefined;

/** Reports an access of this _Browser_Session_ and where it is. */
export function reportActivity(location: string): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'activity', location }));
}

/**
 * Keeps one live event channel to the _Adoc_Server_ for this tab's _Browser_Session_,
 * reconnects after a second, and follows navigate commands from `adoc ui open`.
 */
export function LiveProvider({ children, onNavigate }: { children: ReactNode; onNavigate: (location: string) => void }) {
  const [state, setState] = useState<LiveState>(initial);
  useEffect(() => {
    let timer: number | undefined;
    let stopped = false;
    const connect = () => {
      const current = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/api/events?session=${sessionId()}`);
      socket = current;
      current.onopen = () => reportActivity(location.pathname + location.hash);
      current.onmessage = (event) => {
        const data = JSON.parse(String(event.data));
        if (data.type === 'navigate') {
          onNavigate(data.location);
          return;
        }
        setState((s) => {
          if (data.type === 'hello') return { ...s, status: 'connected', revision: s.revision + 1, messages: data.messages, changed: { keys: ['*'], tick: s.changed.tick + 1 } };
          if (data.type === 'documents') return { ...s, revision: s.revision + 1, changed: { keys: data.changed, tick: s.changed.tick + 1 } };
          if (data.type === 'messages') return { ...s, messages: data.messages };
          return s;
        });
      };
      current.onclose = () => {
        setState((s) => ({ ...s, status: 'disconnected' }));
        if (!stopped) timer = window.setTimeout(connect, 1000);
      };
    };
    connect();
    return () => {
      stopped = true;
      clearTimeout(timer);
      socket?.close();
    };
  }, [onNavigate]);
  return <LiveContext.Provider value={state}>{children}</LiveContext.Provider>;
}

export function useLive(): LiveState {
  return useContext(LiveContext);
}
