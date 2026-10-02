import { useSyncExternalStore } from 'react';
import { formatTarget, type MessageTarget, type UserComment } from './api.js';

/** A draft _User_Comment_ waiting in the _Draft_Comment_List_. */
/** Where a target's own draft comes from: an element of a plugin client module (`adoc-draft`), or the _File_Editor_. */
export type DraftOrigin = 'element' | 'edit';

export interface DraftComment extends UserComment {
  id: number;
  /** Set for a target's own draft: there is at most one per target and origin, and a later one replaces it. */
  origin?: DraftOrigin;
  /** `edit` only: the text before the first edit that has not been sent, the start of the draft's diff. Not sent. */
  base?: string;
}

/** The comment that the server receives for a draft: without the fields that only the browser keeps. */
export function sentComment({ id: _id, origin: _origin, base: _base, ...comment }: DraftComment): UserComment {
  return comment;
}

const isOwnDraft = (d: DraftComment, origin: DraftOrigin, target: MessageTarget) => d.origin === origin && formatTarget(d.target) === formatTarget(target);

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
  /** Puts the one draft of `origin` on a target (a document or a skill), replacing the earlier one. */
  putOwnDraft(origin: DraftOrigin, target: MessageTarget, text: string, base?: string): void {
    const others = drafts.filter((d) => !isOwnDraft(d, origin, target));
    save([...others, { target, text, id: Date.now() + Math.random(), origin, ...(base !== undefined ? { base } : {}) }]);
  },
  ownDraft(origin: DraftOrigin, target: MessageTarget): DraftComment | undefined {
    return drafts.find((d) => isOwnDraft(d, origin, target));
  },
  removeOwnDraft(origin: DraftOrigin, target: MessageTarget): void {
    save(drafts.filter((d) => !isOwnDraft(d, origin, target)));
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
