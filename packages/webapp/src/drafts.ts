import { useSyncExternalStore } from 'react';
import type { UserComment } from './api.js';

/** A draft _User_Comment_ waiting in the _Draft_Comment_List_. */
/** Where a document's own draft comes from: an element of a plugin client module (`adoc-draft`), or the _Document_Editor_. */
export type DraftOrigin = 'element' | 'edit';

export interface DraftComment extends UserComment {
  id: number;
  /** Set for a document's own draft: there is at most one per document and origin, and a later one replaces it. */
  origin?: DraftOrigin;
  /** `edit` only: the text before the first edit that has not been sent, the start of the draft's diff. Not sent. */
  base?: string;
}

/** The comment that the server receives for a draft: without the fields that only the browser keeps. */
export function sentComment({ id: _id, origin: _origin, base: _base, ...comment }: DraftComment): UserComment {
  return comment;
}

const isDocumentDraft = (d: DraftComment, origin: DraftOrigin, key: string) => d.origin === origin && d.target.level === 'document' && d.target.key === key;

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
  /** Puts the one draft of `origin` on a document, replacing the earlier one. */
  putDocumentDraft(origin: DraftOrigin, key: string, text: string, base?: string): void {
    const others = drafts.filter((d) => !isDocumentDraft(d, origin, key));
    save([...others, { target: { level: 'document', key }, text, id: Date.now() + Math.random(), origin, ...(base !== undefined ? { base } : {}) }]);
  },
  documentDraft(origin: DraftOrigin, key: string): DraftComment | undefined {
    return drafts.find((d) => isDocumentDraft(d, origin, key));
  },
  removeDocumentDraft(origin: DraftOrigin, key: string): void {
    save(drafts.filter((d) => !isDocumentDraft(d, origin, key)));
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
