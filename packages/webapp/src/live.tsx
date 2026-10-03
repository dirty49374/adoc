import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { PublicMessage } from './api.js';
import { under } from './base.js';
import { sessionId } from './storage.js';

/** The assigned agent as the server reports it. */
export interface AgentInfo {
  name: string;
  transport: string;
  claim?: { pane: string; herdrSession: string; agent?: string; status?: string; gone: boolean };
}

type TerminalListener = (message: { type: string; [key: string]: unknown }) => void;
const terminalListeners = new Set<TerminalListener>();

/** Sends a terminal command for this tab's _Agent_Terminal_Stream_. */
export function sendTerminal(message: Record<string, unknown>): void {
  if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}

/** Receives terminal frames and state for this tab. */
export function onTerminal(listener: TerminalListener): () => void {
  terminalListeners.add(listener);
  return () => terminalListeners.delete(listener);
}

export interface LiveState {
  status: 'connecting' | 'connected' | 'disconnected';
  /** Increases whenever any document changes. */
  revision: number;
  /** Keys reported by the last change event, with a counter so that equal key lists still trigger effects. */
  changed: { keys: string[]; tick: number };
  messages: PublicMessage[];
  agent?: AgentInfo;
  /** Increases on every reconnect, so that terminals reopen. */
  connection: number;
}

const initial: LiveState = { status: 'connecting', revision: 0, changed: { keys: [], tick: 0 }, messages: [], connection: 0 };
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
      const current = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}${under('/api/events')}?session=${sessionId()}`);
      socket = current;
      current.onopen = () => reportActivity(location.pathname + location.hash);
      current.onmessage = (event) => {
        const data = JSON.parse(String(event.data));
        if (data.type === 'navigate') {
          onNavigate(data.location);
          return;
        }
        if (typeof data.type === 'string' && data.type.startsWith('terminal.')) {
          for (const listener of terminalListeners) listener(data);
          return;
        }
        setState((s) => {
          if (data.type === 'hello') return { ...s, status: 'connected', revision: s.revision + 1, messages: data.messages, agent: data.agent, connection: s.connection + 1, changed: { keys: ['*'], tick: s.changed.tick + 1 } };
          if (data.type === 'agent') return { ...s, agent: data.agent };
          if (data.type === 'documents') {
            // Elements of plugin client modules follow changes of their documents through this window event.
            window.dispatchEvent(new CustomEvent('adoc-documents-changed', { detail: { keys: data.changed } }));
            return { ...s, revision: s.revision + 1, changed: { keys: data.changed, tick: s.changed.tick + 1 } };
          }
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
