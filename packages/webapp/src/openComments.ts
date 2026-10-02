import type { MessageTarget } from './api.js';
import { readStored, writeStored } from './storage.js';

/** A comment popover with typed text that was left open when the page changed. */
export interface OpenComment {
  target: MessageTarget;
  quote?: string;
  source?: string;
  text: string;
}

const KEY = 'adoc.open-comments';

/** Unsaved popover input per document, restored when the person returns to that document. */
export const openComments = {
  get(documentKey: string): OpenComment | undefined {
    return readStored<Record<string, OpenComment>>(KEY, {})[documentKey];
  },
  set(documentKey: string, comment: OpenComment | undefined): void {
    const all = readStored<Record<string, OpenComment>>(KEY, {});
    if (comment && comment.text) all[documentKey] = comment;
    else delete all[documentKey];
    writeStored(KEY, all);
  },
};
