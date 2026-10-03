import { useEffect, useSyncExternalStore } from 'react';
import { BASE, HUB } from './base.js';
import { readStoredOf, sessionIdOf } from './storage.js';

/** One adoc host of the hub's discovery list (_Hub_Discovery_ in adoc_hub). */
export interface HubHost {
  address: string;
  id: string | null;
  name: string | null;
  title?: string;
  machine: string;
  workspace: string;
  status: 'online' | 'offline' | 'unreachable';
  version: string | null;
  agent: { name: string; status: string } | null;
}

/** The address of the host this page belongs to, or empty when no hub serves it. */
export const CURRENT_HOST = HUB ? BASE.replace(/^\/|\/$/g, '') : '';

let hosts: HubHost[] = [];
const listeners = new Set<() => void>();
let started = false;

function publish(next: unknown): void {
  const list = (next as { hosts?: unknown }).hosts;
  if (!Array.isArray(list)) return;
  hosts = list as HubHost[];
  for (const listener of listeners) listener();
}

/** Follows the hub's discovery list: the list once, then its change stream. */
function start(): void {
  if (started || !HUB) return;
  started = true;
  fetch(HUB)
    .then((r) => r.json())
    .then(publish, () => undefined);
  const events = new EventSource(`${HUB}/events`);
  events.onmessage = (event) => publish(JSON.parse(String(event.data)));
}

/** The hosts of the hub, empty when no hub serves the page. */
export function useHubHosts(): HubHost[] {
  start();
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => hosts,
  );
}

/** The path under the hub of a host, at the location this browser last showed there, or its home. */
export function hostPath(host: HubHost): string {
  const last = host.id ? readStoredOf<string>(host.id, 'last-location', '/') : '/';
  return `/${host.address}${last.startsWith('/') ? last : '/'}`;
}

/**
 * Keeps this browser connected as a _Browser_Session_ of every other online host that speaks the protocol of this
 * page's own server, so that `adoc ui open` in any of them moves this browser there.
 */
export function usePresence(list: HubHost[]): void {
  const wanted = list
    .filter((h) => h.status === 'online' && h.id && h.address !== CURRENT_HOST)
    .map((h) => `${h.address} ${h.id}`)
    .sort()
    .join(',');
  useEffect(() => {
    if (!wanted) return;
    let stopped = false;
    const sockets: WebSocket[] = [];
    const timers: number[] = [];
    void (async () => {
      const own = await fetch(`${BASE}api/health`)
        .then((r) => r.json() as Promise<{ protocol?: string }>)
        .catch(() => ({}) as { protocol?: string });
      for (const entry of wanted.split(',')) {
        const [address, id] = entry.split(' ') as [string, string];
        const theirs = await fetch(`/${address}/api/health`)
          .then((r) => r.json() as Promise<{ protocol?: string }>)
          .catch(() => ({}) as { protocol?: string });
        if (!own.protocol || theirs.protocol !== own.protocol) continue;
        const open = () => {
          if (stopped) return;
          const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/${address}/api/events?session=${sessionIdOf(id)}`);
          socket.onmessage = (event) => {
            const data = JSON.parse(String(event.data)) as { type?: string; location?: string };
            if (data.type === 'navigate' && typeof data.location === 'string') location.assign(`/${address}${data.location}`);
          };
          socket.onclose = () => {
            if (!stopped) timers.push(window.setTimeout(open, 3000));
          };
          sockets.push(socket);
        };
        open();
      }
    })();
    return () => {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      for (const socket of sockets) socket.close();
    };
  }, [wanted]);
}
