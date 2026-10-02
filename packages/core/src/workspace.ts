import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import {
  actionResultSchema,
  describeIssues,
  sourceDiff,
  summarySchema,
  type ActionEvent,
  type DocumentSummary,
  type PluginDefinition,
  type PluginDocument,
} from '@adoc/plugin-kit';
import { readConfig, type AdocConfig } from './config.js';
import { AdocError, errorMessage } from './errors.js';
import type { AdocHome } from './home.js';
import { isGitRepository } from './git.js';
import { parseDocumentTarget } from './names.js';
import { loadPlugins, readGuide, type LoadedPlugin } from './plugins.js';
import { readDocument, scanDocuments, type DocumentRecord, type ScanProblem } from './scan.js';
import type { ActionMessageInput } from './messages.js';

/** One entry of a _Document_Summary_List_: the summary, or the key with the parse error. */
export interface SummaryEntry {
  key: string;
  path: string;
  summary?: DocumentSummary;
  error?: string;
}

/** Everything the _Document_Detail_View_ needs for one document. */
export interface DocumentView {
  key: string;
  pluginKey: string;
  path: string;
  file: string;
  version: string;
  summary?: DocumentSummary;
  summaryError?: string;
  html?: string;
  renderError?: string;
}

/** The changes of a document since a base version, from the _Document_Version_Store_. */
export interface DocumentChanges {
  base: string;
  available: boolean;
  html?: string;
  error?: string;
}

const VERSIONS_KEPT = 20;

/** One entry of the report of _Adoc_Check_Command_. */
export interface CheckEntry {
  level: 'error' | 'warning';
  kind: ScanProblem['kind'] | 'plugin-load' | 'parse-error' | 'broken-reference' | 'no-git';
  message: string;
  path?: string;
  key?: string;
}

export interface PluginInfo {
  key: string;
  from: string;
  description?: string;
  layout?: string;
  error?: string;
  documents: number;
}

export type ActionOutcome =
  | { status: 'applied' | 'sent'; message?: ActionMessageInput }
  | { status: 'refused'; reason: string }
  | { status: 'failed'; error: string };

const REF_ATTRIBUTE = /data-adoc-ref="([^"]+)"/g;

function stripScripts(htmlText: string): string {
  return htmlText.replace(/<script\b[\s\S]*?<\/script\s*>/gi, '').replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '');
}

function htmlOf(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value && typeof (value as { html?: unknown }).html === 'string') return (value as { html: string }).html;
  throw new Error('render must return a string or the result of html`…`');
}

function unescapeAttribute(value: string): string {
  return value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
}

/**
 * An opened _Adoc_Workspace_: its configuration, loaded plugins and indexed documents.
 * Plugin calls are cached by _Document_Version_; `refresh` rescans after file changes.
 */
export class Workspace {
  private plugins = new Map<string, LoadedPlugin>();
  private documents = new Map<string, DocumentRecord>();
  private problems: ScanProblem[] = [];
  private cache = new Map<string, { version: string; doc: PluginDocument; summary?: DocumentSummary; summaryError?: string; html?: string; renderError?: string }>();
  /** _Document_Version_Store_: recent versions of each document, oldest first. */
  private versions = new Map<string, Map<string, PluginDocument>>();
  private changeCache = new Map<string, { html?: string; error?: string }>();
  revision = 0;
  /** Whether the workspace is inside a git repository, checked on every refresh. */
  git = false;

  private constructor(
    readonly home: AdocHome,
    readonly config: AdocConfig,
  ) {}

  static async open(home: AdocHome): Promise<Workspace> {
    const workspace = new Workspace(home, await readConfig(home));
    workspace.plugins = await loadPlugins(home.workspace, workspace.config);
    await workspace.refresh();
    return workspace;
  }

  /** Reloads every plugin from disk, for example after its index.ts changed, and rescans. */
  async reloadPlugins(): Promise<void> {
    this.plugins = await loadPlugins(this.root, this.config, true);
    this.cache.clear();
    this.changeCache.clear();
    this.documents.clear();
    await this.refresh();
  }

  get root(): string {
    return this.home.workspace;
  }

  get name(): string {
    return this.root.split('/').pop() ?? this.root;
  }

  /** Rescans the watch paths. Returns the keys whose version changed, appeared or disappeared. */
  async refresh(): Promise<string[]> {
    this.git = await isGitRepository(this.root);
    const scan = await scanDocuments(this.root, this.config.watch, this.plugins);
    const changed = new Set<string>([...this.documents.keys()].filter((k) => !scan.documents.has(k)));
    this.documents = scan.documents;
    this.problems = scan.problems;
    for (const key of [...this.cache.keys()]) if (!this.documents.has(key)) this.cache.delete(key);
    for (const record of this.documents.values()) {
      const { doc, version } = await readDocument(this.root, record);
      const cached = this.cache.get(record.key);
      if (cached?.version !== version) {
        this.cache.set(record.key, { version, doc });
        this.remember(record.key, version, doc);
        changed.add(record.key);
      }
    }
    if (changed.size || this.revision === 0) this.revision++;
    return [...changed];
  }

  private remember(key: string, version: string, doc: PluginDocument): void {
    const kept = this.versions.get(key) ?? new Map<string, PluginDocument>();
    kept.delete(version);
    kept.set(version, doc);
    while (kept.size > VERSIONS_KEPT) kept.delete(kept.keys().next().value!);
    this.versions.set(key, kept);
  }

  /** The changes of a document since `base`: the plugin's renderChanges, or a line diff of the main file. */
  changes(key: string, base: string): DocumentChanges | undefined {
    const entry = this.entry(key);
    if (!entry) return undefined;
    const previous = this.versions.get(key)?.get(base);
    if (!previous) return { base, available: false };
    const cacheKey = `${key}|${base}|${entry.cached.version}`;
    let result = this.changeCache.get(cacheKey);
    if (!result) {
      try {
        const rendered = entry.definition.renderChanges
          ? entry.definition.renderChanges(entry.cached.doc, previous)
          : sourceDiff(previous.text, entry.cached.doc.text, { file: entry.record.file });
        result = { html: stripScripts(htmlOf(rendered)) };
      } catch (error) {
        result = { error: errorMessage(error) };
      }
      this.changeCache.set(cacheKey, result);
    }
    return { base, available: true, ...result };
  }

  pluginInfos(): PluginInfo[] {
    return [...this.plugins.values()].map((p) => {
      const info: PluginInfo = { key: p.key, from: p.from, documents: [...this.documents.values()].filter((d) => d.pluginKey === p.key).length };
      if (p.definition) {
        info.description = p.definition.description;
        info.layout = p.definition.layout.kind === 'file' ? `file ${p.key}-<id>${p.definition.layout.extension}` : `folder ${p.key}-<id>/${p.definition.layout.entry}`;
      }
      if (p.error) info.error = p.error;
      return info;
    });
  }

  plugin(key: string): LoadedPlugin | undefined {
    return this.plugins.get(key);
  }

  record(key: string): DocumentRecord | undefined {
    return this.documents.get(key);
  }

  private definitionOf(record: DocumentRecord): PluginDefinition {
    const definition = this.plugins.get(record.pluginKey)?.definition;
    if (!definition) throw new AdocError('plugin.unavailable', `plugin ${record.pluginKey} is not loaded`);
    return definition;
  }

  private entry(key: string) {
    const record = this.documents.get(key);
    const cached = this.cache.get(key);
    if (!record || !cached) return undefined;
    return { record, cached, definition: this.definitionOf(record) };
  }

  /** The _Document_Summary_ of a document, computed once per version. */
  summarize(key: string): { summary?: DocumentSummary; error?: string } | undefined {
    const entry = this.entry(key);
    if (!entry) return undefined;
    const { cached, definition } = entry;
    if (cached.summary === undefined && cached.summaryError === undefined) {
      try {
        const result = summarySchema.safeParse(definition.summarize(cached.doc));
        if (result.success) cached.summary = result.data;
        else cached.summaryError = `summarize returned an invalid summary: ${describeIssues(result.error, 'summary')}`;
      } catch (error) {
        cached.summaryError = errorMessage(error);
      }
    }
    return cached.summary ? { summary: cached.summary } : { error: cached.summaryError! };
  }

  /** The body HTML of a document from its _Plugin_Renderer_, computed once per version. */
  render(key: string): { html?: string; error?: string } | undefined {
    const entry = this.entry(key);
    if (!entry) return undefined;
    const { cached, definition } = entry;
    if (cached.html === undefined && cached.renderError === undefined) {
      try {
        cached.html = stripScripts(htmlOf(definition.render(cached.doc)));
      } catch (error) {
        cached.renderError = errorMessage(error);
      }
    }
    return cached.html !== undefined ? { html: cached.html } : { error: cached.renderError! };
  }

  /** The _Document_Summary_List_ of one plugin, ordered by key. */
  summaryList(pluginKey: string): SummaryEntry[] {
    return [...this.documents.values()]
      .filter((d) => d.pluginKey === pluginKey)
      .sort((a, b) => a.key.localeCompare(b.key))
      .map((d) => ({ key: d.key, path: d.path, ...this.summarize(d.key) }));
  }

  view(key: string): DocumentView | undefined {
    const entry = this.entry(key);
    if (!entry) return undefined;
    const summary = this.summarize(key)!;
    const rendered = this.render(key)!;
    const view: DocumentView = { key, pluginKey: entry.record.pluginKey, path: entry.record.path, file: entry.record.file, version: entry.cached.version };
    if (summary.summary) view.summary = summary.summary;
    if (summary.error) view.summaryError = summary.error;
    if (rendered.html !== undefined) view.html = rendered.html;
    if (rendered.error) view.renderError = rendered.error;
    return view;
  }

  /** _Document_Reference_Resolution_: the summary of the referenced document, or `found: false`. */
  resolve(target: string): { found: boolean; key: string; summary?: DocumentSummary; error?: string } {
    const parsed = parseDocumentTarget(target);
    const key = parsed?.key ?? target;
    if (!parsed || !this.documents.has(parsed.key)) return { found: false, key };
    return { found: true, key, ...this.summarize(parsed.key) };
  }

  /** Every _Document_Reference_ that the renderer of a document marked. */
  references(key: string): string[] {
    const rendered = this.render(key);
    if (!rendered?.html) return [];
    return [...new Set([...rendered.html.matchAll(REF_ATTRIBUTE)].map((m) => unescapeAttribute(m[1]!)))];
  }

  /** The report of _Adoc_Check_Command_. */
  check(): CheckEntry[] {
    const entries: CheckEntry[] = [];
    if (!this.git) entries.push({ level: 'warning', kind: 'no-git', message: `${this.root} is not in a git repository; the agent cannot commit document changes.` });
    for (const plugin of this.plugins.values()) {
      if (plugin.error) entries.push({ level: 'error', kind: 'plugin-load', message: `plugin ${plugin.key} (${plugin.from}) failed to load: ${plugin.error}` });
    }
    for (const problem of this.problems) {
      const entry: CheckEntry = { level: problem.kind === 'duplicate-key' || problem.kind === 'invalid-local-id' ? 'error' : 'warning', kind: problem.kind, message: problem.message, path: problem.path };
      if (problem.key) entry.key = problem.key;
      entries.push(entry);
    }
    for (const record of [...this.documents.values()].sort((a, b) => a.key.localeCompare(b.key))) {
      const summary = this.summarize(record.key);
      if (summary?.error) entries.push({ level: 'error', kind: 'parse-error', key: record.key, path: record.file, message: `${record.key}: summarize failed: ${summary.error}` });
      const rendered = this.render(record.key);
      if (rendered?.error) entries.push({ level: 'error', kind: 'parse-error', key: record.key, path: record.file, message: `${record.key}: render failed: ${rendered.error}` });
      for (const target of this.references(record.key)) {
        if (!this.resolve(target).found) entries.push({ level: 'warning', kind: 'broken-reference', key: record.key, path: record.file, message: `${record.key} refers to ${target}, which does not exist.` });
      }
    }
    return entries;
  }

  async guide(pluginKey: string): Promise<string> {
    const plugin = this.plugins.get(pluginKey);
    if (!plugin) throw new AdocError('plugin.missing', `No plugin with the key ${pluginKey}.`);
    if (!plugin.definition) throw new AdocError('plugin.unavailable', `plugin ${pluginKey} failed to load: ${plugin.error}`);
    return readGuide(plugin.definition);
  }

  /**
   * Handles one _Document_Action_: runs the _Plugin_Action_Handler_ or the _Default_Action_Handler_,
   * refuses a change when the _Document_Version_ moved, writes returned files and returns the message to send.
   */
  async applyAction(key: string, event: ActionEvent, version: string): Promise<ActionOutcome> {
    const entry = this.entry(key);
    if (!entry) return { status: 'refused', reason: `${key} no longer exists.` };
    await this.refresh();
    const fresh = this.entry(key);
    if (!fresh) return { status: 'refused', reason: `${key} no longer exists.` };
    const target = event.anchor ? { level: 'anchor' as const, key, anchor: event.anchor } : { level: 'document' as const, key };
    const base = { target, action: event.name, value: event.value, ...(event.to !== undefined ? { to: event.to } : {}) };
    const handler = fresh.definition.actions?.[event.name];
    if (!handler) {
      const value = event.kind === 'drag' ? `${event.value} to ${event.to ?? ''}` : event.kind === 'toggle' ? String(event.checked) : event.value;
      return { status: 'sent', message: { ...base, applied: false, text: `user request: ${event.name} ${value}`.trim() } };
    }
    let result;
    try {
      const raw = handler(fresh.cached.doc, event) ?? {};
      const parsed = actionResultSchema.safeParse(raw);
      if (!parsed.success) throw new Error(`action ${event.name} returned an invalid result: ${describeIssues(parsed.error, 'result')}`);
      result = parsed.data;
    } catch (error) {
      return { status: 'failed', error: errorMessage(error) };
    }
    const writes: Array<[string, string]> = [];
    if (result.text !== undefined) writes.push([fresh.record.file, result.text]);
    for (const [rel, text] of Object.entries(result.files ?? {})) {
      if (fresh.record.kind !== 'folder') return { status: 'failed', error: `action ${event.name} returned files, but ${key} is a file document; return text instead.` };
      const path = normalize(`${fresh.record.path}/${rel}`);
      if (!path.startsWith(`${fresh.record.path}/`)) return { status: 'failed', error: `action ${event.name} tried to write outside ${key}: ${rel}` };
      writes.push([path, text]);
    }
    if (writes.length) {
      if (fresh.cached.version !== version) return { status: 'refused', reason: `${key} changed after it was shown; reload and try again.` };
      for (const [path, text] of writes) {
        await mkdir(dirname(join(this.root, path)), { recursive: true });
        await writeFile(join(this.root, path), text);
      }
      await this.refresh();
    }
    const applied = writes.length > 0;
    if (result.message === undefined) return { status: applied ? 'applied' : 'sent' };
    return { status: applied ? 'applied' : 'sent', message: { ...base, applied, text: result.message } };
  }
}
