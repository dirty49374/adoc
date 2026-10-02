import { useSyncExternalStore } from 'react';
import type { UserComment } from './api.js';

/** A draft _User_Comment_ waiting in the _Draft_Comment_List_. */
export interface DraftComment extends UserComment {
  id: number;
  /** `element`: put by an element of a plugin client module (`adoc-draft`); there is at most one per document. */
  origin?: 'element';
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
  /** Puts the one draft of an element on its document, replacing the element's earlier draft there. */
  putElementDraft(comment: UserComment & { target: { level: 'document'; key: string } }): void {
    const others = drafts.filter((d) => !(d.origin === 'element' && d.target.level === 'document' && d.target.key === comment.target.key));
    save([...others, { ...comment, id: Date.now() + Math.random(), origin: 'element' }]);
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
