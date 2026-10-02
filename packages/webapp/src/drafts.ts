import { useSyncExternalStore } from 'react';
import type { UserComment } from './api.js';

/** A draft _User_Comment_ waiting in the _Draft_Comment_List_. */
export interface DraftComment extends UserComment {
  id: number;
}

const STORAGE_KEY = 'adoc.drafts';
const listeners = new Set<() => void>();

function load(): DraftComment[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

let drafts: DraftComment[] = load();

function save(next: DraftComment[]): void {
  drafts = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Drafts still live in memory when storage is unavailable.
  }
  for (const listener of listeners) listener();
}

/** Drafts live in the browser until the _Comment_Composer_ sends them; they survive navigation and reloads. */
export const draftStore = {
  add(comment: UserComment): void {
    save([...drafts, { ...comment, id: Date.now() + Math.random() }]);
  },
  remove(id: number): void {
    save(drafts.filter((d) => d.id !== id));
  },
  clear(ids: readonly number[]): void {
    save(drafts.filter((d) => !ids.includes(d.id)));
  },
};

export function useDrafts(): DraftComment[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => drafts,
  );
}
