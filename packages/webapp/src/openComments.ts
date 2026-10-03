import type { MessageTarget } from './api.js';
import { readStored, writeStored } from './storage.js';

/** A comment popover with typed text that was left open when the page changed. */
export interface OpenComment {
  target: MessageTarget;
  quote?: string;
  source?: string;
  text: string;
}

const KEY = 'open-comments';

/** Unsaved popover input per document, restored when the user returns to that document. */
export const openComments = {
  /** By the target of the body the comment was opened in, as written by formatTarget. */
  get(subject: string): OpenComment | undefined {
    return readStored<Record<string, OpenComment>>(KEY, {})[subject];
  },
  set(subject: string, comment: OpenComment | undefined): void {
    const all = readStored<Record<string, OpenComment>>(KEY, {});
    if (comment && comment.text) all[subject] = comment;
    else delete all[subject];
    writeStored(KEY, all);
  },
};
