export interface DocumentSummary {
  title: string;
  status: string;
  fields?: Record<string, string | number | boolean>;
}

export interface PluginInfo {
  key: string;
  from: string;
  description?: string;
  layout?: string;
  error?: string;
  documents: number;
  /** The plugin's client module (`client/index.js`), and whether it has a stylesheet. */
  client?: { style: boolean };
}

export interface CheckEntry {
  level: 'error' | 'warning';
  kind: string;
  message: string;
  path?: string;
  key?: string;
}

export interface WorkspaceInfo {
  name: string;
  root: string;
  revision: number;
  agent: { name: string; transport: string };
  git: boolean;
  plugins: PluginInfo[];
  check: CheckEntry[];
}

export interface SummaryEntry {
  key: string;
  path: string;
  updatedAt: string;
  archived: boolean;
  summary?: DocumentSummary;
  error?: string;
}

export interface DocumentView {
  key: string;
  pluginKey: string;
  path: string;
  file: string;
  version: string;
  archived: boolean;
  summary?: DocumentSummary;
  summaryError?: string;
  html?: string;
  renderError?: string;
  changes?: { base: string; available: boolean; html?: string; error?: string };
}

export interface ReferenceInfo {
  target: string;
  found: boolean;
  key: string;
  archived?: boolean;
  summary?: DocumentSummary;
  error?: string;
}

/** A held _User_Message_ as the server publishes it. */
export interface PublicComment {
  target: string;
  text: string;
  quote?: string;
  source?: string;
}

export interface PublicMessage {
  number: number;
  kind: 'comment' | 'action';
  comments?: PublicComment[];
  target?: string;
  text?: string;
  action?: string;
  value?: string;
  applied?: boolean;
  formatted: string;
}

export type MessageTarget =
  | { level: 'workspace' }
  | { level: 'plugin'; pluginKey: string }
  | { level: 'document'; key: string }
  | { level: 'anchor'; key: string; anchor: string };

/** One _User_Comment_: a draft before sending, an entry of a comment message after. */
export interface UserComment {
  target: MessageTarget;
  text: string;
  quote?: string;
  source?: string;
}

export interface ActionRequest {
  key: string;
  version: string;
  event: { kind: 'click' | 'toggle' | 'drag' | 'client'; name: string; value: string; checked?: boolean; to?: string; anchor?: string };
}

export type ActionResponse = { status: 'applied' | 'sent'; version?: string; message?: PublicMessage } | { status: 'refused'; reason: string } | { status: 'failed'; error: string };

export type EditResponse = { status: 'applied'; version: string; diff: string } | { status: 'refused'; reason: string };

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok && response.status !== 409 && response.status !== 422) throw new HttpError(response.status, body.error ?? `${path} failed (${response.status})`);
  return body;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

export const api = {
  workspace: () => request<WorkspaceInfo>('/api/workspace'),
  documents: (pluginKey: string) => request<{ pluginKey: string; error?: string; documents: SummaryEntry[] }>(`/api/plugins/${pluginKey}/documents`),
  document: (key: string, base?: string) => request<DocumentView>(`/api/documents/${encodeURIComponent(key)}${base ? `?base=${base}` : ''}`),
  versions: (key: string) => request<{ versions: Array<{ version: string; seenAt: string; current: boolean }> }>(`/api/documents/${encodeURIComponent(key)}/versions`),
  references: (targets: string[]) => request<{ references: ReferenceInfo[] }>(`/api/references?targets=${targets.map(encodeURIComponent).join(',')}`),
  sendComments: (body: { target?: MessageTarget; text?: string; comments: UserComment[] }) => request<{ message: PublicMessage }>('/api/messages', post(body)),
  sendAction: (body: ActionRequest) => request<ActionResponse>('/api/actions', post(body)),
  file: (key: string) => request<{ key: string; version: string; file: string; text: string }>(`/api/documents/${encodeURIComponent(key)}/file`),
  editFile: (key: string, body: { version: string; text: string; since?: string }) =>
    request<EditResponse>(`/api/documents/${encodeURIComponent(key)}/file`, post(body)),
};

/** Writes a target as in _User_Message_Format_. */
export function formatTarget(target: MessageTarget): string {
  switch (target.level) {
    case 'workspace':
      return 'workspace';
    case 'plugin':
      return target.pluginKey;
    case 'document':
      return target.key;
    case 'anchor':
      return `${target.key}#${target.anchor}`;
  }
}

/** The plugin key of a document key: `TASK-a` → `TASK`. */
export function pluginOf(key: string): string {
  return key.slice(0, key.indexOf('-'));
}
