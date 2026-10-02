/** _Plugin_Key_: uppercase letters only. */
export const PLUGIN_KEY_PATTERN = /^[A-Z]+$/;
/** _Document_Local_ID_: lowercase letters, digits, hyphens, underscores and dots. */
export const LOCAL_ID_PATTERN = /^[a-z0-9._-]+$/;
/** A file or folder name that starts like a _Document_Key_. */
export const KEY_PREFIX_PATTERN = /^([A-Z]+)-(.+)$/;

export interface ParsedTarget {
  key: string;
  pluginKey: string;
  localId: string;
  anchor?: string;
}

/** Parses `TASK-1231` or `TASK-1231#method`. Returns undefined when the text is not a document key. */
export function parseDocumentTarget(text: string): ParsedTarget | undefined {
  const hash = text.indexOf('#');
  const key = hash < 0 ? text : text.slice(0, hash);
  const match = KEY_PREFIX_PATTERN.exec(key);
  if (!match || !LOCAL_ID_PATTERN.test(match[2]!)) return undefined;
  const parsed: ParsedTarget = { key, pluginKey: match[1]!, localId: match[2]! };
  if (hash >= 0) parsed.anchor = text.slice(hash + 1);
  return parsed;
}
