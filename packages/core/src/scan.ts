import { readdir, readFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, relative, resolve, sep } from 'node:path';
import type { PluginDocument } from '@adoc/plugin-kit';
import { KEY_PREFIX_PATTERN, LOCAL_ID_PATTERN } from './names.js';
import type { LoadedPlugin } from './plugins.js';

/** Where one _Document_ lives. Paths are workspace-relative with forward slashes. */
export interface DocumentRecord {
  readonly key: string;
  readonly pluginKey: string;
  readonly localId: string;
  readonly kind: 'file' | 'folder';
  readonly path: string;
  readonly file: string;
}

export interface ScanProblem {
  readonly kind: 'duplicate-key' | 'unknown-plugin-key' | 'invalid-local-id' | 'layout-mismatch';
  readonly message: string;
  readonly path: string;
  readonly key?: string;
}

export interface ScanResult {
  readonly documents: Map<string, DocumentRecord>;
  readonly problems: ScanProblem[];
}

const toPosix = (path: string) => path.split(sep).join('/');

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

/** Finds every _Document_ under the _Watch_Path_ entries. A file under overlapping watch paths counts once. */
export async function scanDocuments(workspace: string, watch: readonly string[], plugins: Map<string, LoadedPlugin>): Promise<ScanResult> {
  const documents = new Map<string, DocumentRecord>();
  const problems: ScanProblem[] = [];
  const seen = new Set<string>();

  const visit = async (directory: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
      const absolute = join(directory, entry.name);
      if (seen.has(absolute)) continue;
      seen.add(absolute);
      const relPath = toPosix(relative(workspace, absolute));
      const isDir = entry.isDirectory();
      const match = KEY_PREFIX_PATTERN.exec(entry.name);
      if (!match) {
        if (isDir) await visit(absolute);
        continue;
      }
      const pluginKey = match[1]!;
      const plugin = plugins.get(pluginKey);
      if (!plugin) {
        problems.push({ kind: 'unknown-plugin-key', path: relPath, message: `${relPath} looks like a document key, but no plugin is declared with the key ${pluginKey}.` });
        continue;
      }
      if (!plugin.definition) continue;
      const layout = plugin.definition.layout;
      let localId: string;
      let file: string;
      if (layout.kind === 'file') {
        if (isDir || !entry.name.endsWith(layout.extension)) {
          problems.push({ kind: 'layout-mismatch', path: relPath, message: `${relPath}: ${pluginKey} documents are files ending with ${layout.extension}.` });
          continue;
        }
        localId = match[2]!.slice(0, -layout.extension.length);
        file = relPath;
      } else {
        if (!isDir) {
          problems.push({ kind: 'layout-mismatch', path: relPath, message: `${relPath}: ${pluginKey} documents are folders with ${layout.entry} inside.` });
          continue;
        }
        localId = match[2]!;
        file = `${relPath}/${layout.entry}`;
      }
      const key = `${pluginKey}-${localId}`;
      if (!LOCAL_ID_PATTERN.test(localId)) {
        problems.push({ kind: 'invalid-local-id', path: relPath, key, message: `${relPath}: the local id "${localId}" may use only lowercase letters, digits, hyphens, underscores and dots.` });
        continue;
      }
      const existing = documents.get(key);
      if (existing) {
        problems.push({ kind: 'duplicate-key', path: relPath, key, message: `${key} is carried by both ${existing.path} and ${relPath}; ${existing.path} is used.` });
        continue;
      }
      documents.set(key, { key, pluginKey, localId, kind: layout.kind, path: relPath, file });
    }
  };

  for (const path of watch) await visit(resolve(workspace, path));
  return { documents, problems };
}

async function listFiles(root: string, prefix = ''): Promise<string[]> {
  const out: string[] = [];
  for (const entry of await readdir(join(root, prefix), { withFileTypes: true })) {
    const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...(await listFiles(root, rel)));
    else out.push(rel);
  }
  return out.sort();
}

/** Reads a document into the shape plugins receive, together with its _Document_Version_. */
export async function readDocument(workspace: string, record: DocumentRecord): Promise<{ doc: PluginDocument; version: string }> {
  const files: Record<string, string> = {};
  const absolute = join(workspace, record.path);
  if (record.kind === 'file') {
    files[record.path.split('/').pop()!] = await readFile(absolute, 'utf8');
  } else if (await isDirectory(absolute)) {
    for (const rel of await listFiles(absolute)) files[rel] = await readFile(join(absolute, rel), 'utf8');
  }
  const mainName = record.kind === 'file' ? record.path.split('/').pop()! : record.file.slice(record.path.length + 1);
  const hash = createHash('sha256');
  for (const name of Object.keys(files).sort()) hash.update(name).update('\0').update(files[name]!).update('\0');
  const doc: PluginDocument = {
    key: record.key,
    pluginKey: record.pluginKey,
    localId: record.localId,
    path: record.path,
    file: record.file,
    text: files[mainName] ?? '',
    files,
  };
  return { doc, version: hash.digest('hex').slice(0, 16) };
}
