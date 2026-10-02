/** Per-browser conveniences in localStorage; every access tolerates storage being unavailable. */
export function readStored<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw === null ? fallback : (JSON.parse(raw) as T);
  } catch {
    return fallback;
  }
}

export function writeStored(key: string, value: unknown): void {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Memory still holds the value for this page.
  }
}

/** The id of this tab's _Browser_Session_, kept across reloads of the tab. */
export function sessionId(): string {
  try {
    let id = sessionStorage.getItem('adoc.session');
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem('adoc.session', id);
    }
    return id;
  } catch {
    return 'anonymous';
  }
}

/** The version of each document that this browser showed last: the base of the _Change_Toggle_. */
export const seenVersions = {
  get(key: string): string | undefined {
    return readStored<Record<string, string>>('adoc.seen', {})[key];
  },
  set(key: string, version: string): void {
    writeStored('adoc.seen', { ...readStored<Record<string, string>>('adoc.seen', {}), [key]: version });
  },
};
