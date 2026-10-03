import { WORKSPACE_ID } from './base.js';

/**
 * Per-browser conveniences in localStorage; every access tolerates storage being unavailable. Every key names the workspace
 * (`adoc.<workspace id>.<name>`), so that workspaces served under one origin, as through a hub, keep their values apart.
 */
function keyOf(workspaceId: string, name: string): string {
  return `adoc.${workspaceId}.${name}`;
}

function key(name: string): string {
  return keyOf(WORKSPACE_ID, name);
}

/** A value that another workspace served under this origin stored, such as its last location (read only). */
export function readStoredOf<T>(workspaceId: string, name: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(keyOf(workspaceId, name));
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function readStored<T>(name: string, fallback: T): T {
  try {
    let raw = localStorage.getItem(key(name));
    // A value stored before keys named the workspace (`adoc.<name>`) belongs to this origin's workspace: move it once.
    const old = raw === null ? localStorage.getItem(`adoc.${name}`) : null;
    if (old !== null) {
      localStorage.setItem(key(name), old);
      localStorage.removeItem(`adoc.${name}`);
      raw = old;
    }
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStored(name: string, value: unknown): void {
  try {
    if (value === undefined) localStorage.removeItem(key(name));
    else localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    // Memory still holds the value for this page.
  }
}

/** The id of this tab's _Browser_Session_ at a workspace, kept across reloads of the tab. */
export function sessionIdOf(workspaceId: string): string {
  try {
    let id = sessionStorage.getItem(keyOf(workspaceId, 'session'));
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem(keyOf(workspaceId, 'session'), id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

/** The id of this tab's _Browser_Session_ at its own workspace. */
export function sessionId(): string {
  return sessionIdOf(WORKSPACE_ID);
}

/** The version of each document that this browser showed last: the base of the _Change_Toggle_. */
export const seenVersions = {
  get(key: string): string | undefined {
    return readStored<Record<string, string>>('seen', {})[key];
  },
  set(key: string, version: string): void {
    writeStored('seen', { ...readStored<Record<string, string>>('seen', {}), [key]: version });
  },
};
