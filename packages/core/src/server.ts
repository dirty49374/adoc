import { watch, type FSWatcher } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createRequire } from 'node:module';
import { dirname, extname, join, resolve } from 'node:path';
import { frontmatter, markdown } from '@agent-workshop/adoc-plugin-kit';
import { WebSocketServer, type WebSocket } from 'ws';
import { z } from 'zod';
import { AdocError, errorMessage } from './errors.js';
import { formatMessage, messageFields, MessageQueue, type MessageTarget, type UserComment, type UserMessage } from './messages.js';
import { LOCAL_ID_PATTERN, PLUGIN_KEY_PATTERN, parseDocumentTarget } from './names.js';
import { attachTransport, createTransport, type MessageTransport } from './transports.js';
import { formatCheck } from './report.js';
import { checkSkills, editSkillFile, listSkills, readSkillFile, viewSkill } from './skills.js';
import { readServerRecord, removeServerRecord, writeServerRecord } from './registry.js';
import { readClaim, CLAIM_FILE, type AgentClaim } from './claim.js';
import { herdrPanes, herdrSubscribe } from './herdr.js';
import { TerminalRelay } from './terminal.js';
import type { Workspace } from './workspace.js';

export const PROTOCOL = 'adoc/1';

/** A _Browser_Session_ as the server tracks it. */
export interface BrowserSession {
  id: string;
  connected: boolean;
  lastAccess: string;
  location: string;
}

/** Handles a request outside adoc's own routes, such as `/mcp`. Returns true when it handled the request. */
export type ServerExtension = (request: IncomingMessage, response: ServerResponse) => Promise<boolean>;

export interface ServerOptions {
  host?: string;
  port?: number;
  extensions?: ServerExtension[];
  log?: (line: string) => void;
  debounceMs?: number;
}

const targetSchema = z.discriminatedUnion('level', [
  z.object({ level: z.literal('workspace') }),
  z.object({ level: z.literal('plugin'), pluginKey: z.string().regex(PLUGIN_KEY_PATTERN) }),
  z.object({ level: z.literal('document'), key: z.string() }),
  z.object({ level: z.literal('anchor'), key: z.string(), anchor: z.string().min(1) }),
  z.object({ level: z.literal('skill'), name: z.string().regex(/^[a-z0-9][a-z0-9.-]*$/, 'a skill name is lowercase words with hyphens') }),
]);

const commentSchema = z.object({
  target: targetSchema.optional(),
  text: z.string().optional(),
  comments: z
    .array(
      z.object({
        target: targetSchema,
        text: z.string().refine((t) => t.trim() !== '', 'a comment must not be empty'),
        quote: z.string().optional(),
        source: z.string().optional(),
      }),
    )
    .default([]),
}).refine((m) => (m.text?.trim() && m.target) || m.comments.length > 0, 'a comment message needs text with a target, or at least one comment');

const editSchema = z.object({ version: z.string(), text: z.string(), since: z.string().optional() });

const actionSchema = z.object({
  key: z.string(),
  version: z.string(),
  event: z.object({
    kind: z.enum(['click', 'toggle', 'drag', 'client']),
    name: z.string().min(1),
    value: z.string(),
    checked: z.boolean().optional(),
    to: z.string().optional(),
    anchor: z.string().optional(),
  }),
});

const openSchema = z.object({ target: z.string().min(1), session: z.string().optional() });

const WEBAPP_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.map': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf',
  '.png': 'image/png',
  '.json': 'application/json',
  '.txt': 'text/plain; charset=utf-8',
};

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-cache' });
  response.end(JSON.stringify(body));
}

async function readBody(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    size += (chunk as Buffer).length;
    if (size > 32_000_000) throw new AdocError('request.too-large', 'request body is larger than 32 MB');
    chunks.push(chunk as Buffer);
  }
  return chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {};
}

function validTarget(target: MessageTarget, workspace: Workspace): string | undefined {
  if (target.level === 'plugin' && !workspace.plugin(target.pluginKey)) return `no plugin ${target.pluginKey}`;
  if (target.level === 'document' || target.level === 'anchor') {
    const parsed = parseDocumentTarget(target.key);
    if (!parsed || parsed.anchor !== undefined || !LOCAL_ID_PATTERN.test(parsed.localId)) return `${target.key} is not a document key`;
  }
  return undefined;
}

export function publicMessage(message: UserMessage) {
  return { ...messageFields(message), formatted: formatMessage(message) };
}

/**
 * _Adoc_Server_: serves the _Adoc_Web_UI_, the REST API and live events for one workspace,
 * watches its files and holds every _User_Message_ until delivery.
 */
export class AdocServer {
  readonly queue = new MessageQueue();
  readonly transport: MessageTransport;
  private readonly listener: Server;
  private readonly sockets: WebSocketServer;
  private watchers: FSWatcher[] = [];
  private readonly sessions = new Map<string, BrowserSession & { sockets: Set<WebSocket> }>();
  private claim: AgentClaim | undefined;
  private agentStatus: { status?: string; gone: boolean } = { gone: false };
  private unsubscribe: (() => void) | undefined;
  private retryHeld: () => void = () => undefined;
  private readonly terminal: TerminalRelay;
  private debounce: NodeJS.Timeout | undefined;
  private chain: Promise<unknown> = Promise.resolve();
  private readonly host: string;
  private readonly port: number;
  private readonly log: (line: string) => void;
  private readonly webappDirectory = join(dirname(createRequire(import.meta.url).resolve('@agent-workshop/adoc-webapp/package.json')), 'dist');

  constructor(
    readonly workspace: Workspace,
    private readonly options: ServerOptions = {},
  ) {
    this.host = options.host ?? workspace.config.server.host;
    this.port = options.port ?? workspace.config.server.port;
    this.log = options.log ?? ((line) => process.stderr.write(line + '\n'));
    this.transport = createTransport(workspace.config.agent.transport, () => (this.agentStatus.gone ? undefined : this.claim));
    this.retryHeld = attachTransport(this.queue, this.transport, this.log);
    this.terminal = new TerminalRelay(() => (this.agentStatus.gone ? undefined : this.claim), this.log);
    this.listener = createServer((request, response) => {
      void this.handle(request, response).catch((error) => {
        if (!response.headersSent) sendJson(response, error instanceof AdocError ? 400 : 500, { error: errorMessage(error) });
        else response.end();
      });
    });
    this.sockets = new WebSocketServer({ noServer: true });
    this.listener.on('upgrade', (request, socket, head) => {
      if (request.url?.split('?')[0] !== '/api/events') return socket.destroy();
      const session = new URL(request.url ?? '/', 'http://localhost').searchParams.get('session') ?? '';
      this.sockets.handleUpgrade(request, socket, head, (ws) => this.welcome(ws, session));
    });
    this.queue.on('change', () => this.broadcast({ type: 'messages', messages: this.queue.list().map(publicMessage) }));
  }

  get url(): string {
    const host = this.host === '0.0.0.0' || this.host === '::' ? '127.0.0.1' : this.host;
    return `http://${host}:${this.port}`;
  }

  async start(): Promise<void> {
    const running = await readServerRecord(this.workspace.root);
    if (running) throw new AdocError('server.running', `An adoc server for ${this.workspace.root} is already running at ${running.url} (pid ${running.pid}).`);
    try {
      await new Promise<void>((resolveListen, reject) => {
        this.listener.once('error', reject);
        this.listener.listen(this.port, this.host, () => {
          this.listener.off('error', reject);
          resolveListen();
        });
      });
    } catch (error) {
      throw new AdocError('server.listen', `Cannot listen at ${this.host}:${this.port}: ${errorMessage(error)}`);
    }
    await writeServerRecord({ pid: process.pid, url: this.url, workspace: this.workspace.root });
    await this.loadClaim();
    this.watchers.push(
      watch(this.workspace.home.home, (_event, file) => {
        if (file === CLAIM_FILE) void this.loadClaim();
      }),
    );
    for (const path of this.workspace.config.watch) {
      const absolute = resolve(this.workspace.root, path);
      try {
        if (!(await stat(absolute)).isDirectory()) continue;
        this.watchers.push(watch(absolute, { recursive: true }, () => this.schedule()));
      } catch {
        this.log(`adoc: watch path ${path} does not exist`);
      }
    }
    for (const plugin of this.workspace.pluginInfos()) {
      // npm packages are not watched: they change only through npm.
      if (!plugin.directory || plugin.directory.split(/[\\/]/).includes('node_modules')) continue;
      try {
        // Only the top of the folder, where index.ts lives: a plugin folder may hold node_modules and a built client/.
        if ((await stat(plugin.directory)).isDirectory()) this.watchers.push(watch(plugin.directory, () => this.schedulePluginReload()));
      } catch {
        // A missing plugin folder is already reported as a load error.
      }
    }
    const report = [...this.workspace.check(), ...(await checkSkills(this.workspace))];
    this.log(report.length ? formatCheck(report) : 'adoc check: no problems');
    const git = this.workspace.git ? 'git' : 'no git';
    this.log(`adoc server for ${this.workspace.root} at ${this.url} (transport: ${this.transport.kind}, ${git})`);
  }

  async stop(): Promise<void> {
    clearTimeout(this.debounce);
    clearTimeout(this.pluginDebounce);
    this.unsubscribe?.();
    this.terminal.stopAll('server-stopped');
    for (const watcher of this.watchers) watcher.close();
    for (const client of this.sockets.clients) client.terminate();
    this.sockets.close();
    const closed = new Promise<void>((done) => this.listener.close(() => done()));
    this.listener.closeAllConnections();
    await closed;
    await removeServerRecord(this.workspace.root);
  }

  /** Serializes workspace work so that rescans and actions never overlap. */
  private run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.chain.then(task, task);
    this.chain = next.catch(() => undefined);
    return next;
  }

  private pluginDebounce: NodeJS.Timeout | undefined;

  private schedulePluginReload(): void {
    clearTimeout(this.pluginDebounce);
    this.pluginDebounce = setTimeout(() => {
      void this.run(() => this.workspace.reloadPlugins()).then(() => {
        this.log('adoc: plugins reloaded');
        this.broadcast({ type: 'documents', revision: this.workspace.revision, changed: ['*'] });
      });
    }, 200);
  }

  private schedule(): void {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => void this.rescan(), this.options.debounceMs ?? 120);
  }

  /** _Document_Change_Notification_: rescans and tells browsers which documents changed. */
  async rescan(): Promise<void> {
    const changed = await this.run(() => this.workspace.refresh());
    if (changed.length) this.broadcast({ type: 'documents', revision: this.workspace.revision, changed });
  }

  private welcome(ws: WebSocket, id: string): void {
    ws.on('message', (data) => {
      try {
        const event = JSON.parse(String(data)) as { type?: string; mode?: 'observe' | 'control'; cols?: number; rows?: number; data?: string; lines?: number; action?: string; button?: string; column?: number; row?: number };
        const size = (n: unknown, fallback: number) => (typeof n === 'number' && n >= 10 && n <= 500 ? Math.floor(n) : fallback);
        if (event.type === 'terminal.open') this.terminal.open(ws, event.mode === 'control' ? 'control' : 'observe', size(event.cols, 100), size(event.rows, 30));
        else if (event.type === 'terminal.input' && typeof event.data === 'string') this.terminal.input(ws, event.data);
        else if (event.type === 'terminal.resize') this.terminal.resize(ws, size(event.cols, 100), size(event.rows, 30));
        else if (event.type === 'terminal.scroll' && typeof event.lines === 'number') this.terminal.scroll(ws, event.lines);
        else if (event.type === 'terminal.mouse' && typeof event.column === 'number' && typeof event.row === 'number' && ['down', 'up', 'drag', 'move'].includes(event.action ?? '')) {
          const button = event.button === 'middle' || event.button === 'right' ? event.button : 'left';
          this.terminal.mouse(ws, event.action as 'down' | 'up' | 'drag' | 'move', button, event.column, event.row);
        } else if (event.type === 'terminal.close') this.terminal.stop(ws);
      } catch {
        // Ignore malformed browser events.
      }
    });
    ws.on('close', () => this.terminal.stop(ws));
    if (id) {
      const session = this.sessions.get(id) ?? { id, connected: true, lastAccess: new Date().toISOString(), location: '/', sockets: new Set<WebSocket>() };
      session.sockets.add(ws);
      session.connected = true;
      this.sessions.set(id, session);
      ws.on('message', (data) => {
        try {
          const event = JSON.parse(String(data)) as { type?: string; location?: string };
          if (event.type === 'activity') {
            session.lastAccess = new Date().toISOString();
            if (typeof event.location === 'string') session.location = event.location;
          }
        } catch {
          // Ignore malformed browser events.
        }
      });
      ws.on('close', () => {
        session.sockets.delete(ws);
        session.connected = session.sockets.size > 0;
      });
    }
    ws.send(JSON.stringify({ type: 'hello', revision: this.workspace.revision, messages: this.queue.list().map(publicMessage), agent: this.agentInfo() }));
  }

  /** Reads `.adoc/claim.yaml`, follows the claimed pane's agent status, and retries held messages. */
  private async loadClaim(): Promise<void> {
    const claim = await readClaim(this.workspace.home);
    const changed = claim?.pane !== this.claim?.pane || claim?.socket !== this.claim?.socket || claim?.claimedAt !== this.claim?.claimedAt;
    if (!changed) return;
    this.claim = claim;
    this.unsubscribe?.();
    this.unsubscribe = undefined;
    this.terminal.stopAll('claim-changed');
    if (claim) {
      const pane = (await herdrPanes(claim.socket).catch(() => [])).find((p) => p.pane_id === claim.pane);
      this.agentStatus = pane ? (pane.agent_status ? { status: pane.agent_status, gone: false } : { gone: false }) : { gone: true };
      this.unsubscribe = herdrSubscribe(
        claim.socket,
        [{ type: 'pane.agent_status_changed', pane_id: claim.pane }, { type: 'pane.closed' }, { type: 'pane.exited' }],
        (event) => {
          const data = (event.data ?? {}) as { pane_id?: string; agent_status?: string; pane?: { pane_id?: string; agent_status?: string } };
          const paneId = data.pane_id ?? data.pane?.pane_id;
          if (paneId !== claim.pane) return;
          if (event.event?.includes('closed') || event.event?.includes('exited')) this.agentStatus = { gone: true };
          else {
            const status = data.agent_status ?? data.pane?.agent_status;
            this.agentStatus = status ? { status, gone: false } : { gone: false };
          }
          this.broadcastAgent();
        },
        () => {
          // herdr restarted or dropped the subscription: read the claim's pane again after a moment.
          setTimeout(() => {
            if (this.claim === claim) {
              this.claim = undefined;
              void this.loadClaim();
            }
          }, 2000).unref();
        },
      );
      this.log(`adoc: assigned agent is herdr pane ${claim.pane} (${claim.herdrSession})${this.agentStatus.gone ? ', which is gone' : ''}`);
      if (!this.agentStatus.gone) this.retryHeld();
    } else {
      this.agentStatus = { gone: false };
    }
    this.broadcastAgent();
  }

  /** The assigned agent as the web UI shows it. */
  agentInfo() {
    const info: Record<string, unknown> = { name: this.workspace.config.agent.name, transport: this.transport.kind };
    if (this.claim) info.claim = { pane: this.claim.pane, herdrSession: this.claim.herdrSession, agent: this.claim.agent, status: this.agentStatus.status, gone: this.agentStatus.gone };
    return info;
  }

  private broadcastAgent(): void {
    this.broadcast({ type: 'agent', agent: this.agentInfo() });
  }

  /** Every _Browser_Session_, most recent access first. */
  browserSessions(): BrowserSession[] {
    return [...this.sessions.values()]
      .map(({ sockets: _sockets, ...session }) => session)
      .sort((a, b) => b.lastAccess.localeCompare(a.lastAccess));
  }

  /** Sends a browser session to a document, an anchor or a plugin; by default the connected session accessed last. */
  openInBrowser(target: string, sessionId?: string): { session: string; location: string } {
    let location: string;
    if (PLUGIN_KEY_PATTERN.test(target)) {
      if (!this.workspace.plugin(target)) throw new AdocError('ui.target', `No plugin ${target}.`);
      location = `/p/${target}`;
    } else {
      const parsed = parseDocumentTarget(target);
      if (!parsed || !this.workspace.record(parsed.key)) throw new AdocError('ui.target', `${target} is neither a plugin key nor an existing document.`);
      location = `/p/${parsed.pluginKey}/${parsed.key}${parsed.anchor ? `#${encodeURIComponent(parsed.anchor)}` : ''}`;
    }
    const candidates = this.browserSessions().filter((s) => s.connected && (!sessionId || s.id === sessionId));
    const chosen = candidates[0];
    if (!chosen) throw new AdocError('ui.session', sessionId ? `No connected browser session ${sessionId}.` : 'No browser session is connected; open the adoc web UI first.');
    const session = this.sessions.get(chosen.id)!;
    for (const socket of session.sockets) socket.send(JSON.stringify({ type: 'navigate', location }));
    session.location = location;
    return { session: chosen.id, location };
  }

  private broadcast(event: unknown): void {
    const text = JSON.stringify(event);
    for (const client of this.sockets.clients) if (client.readyState === client.OPEN) client.send(text);
  }

  private async handle(request: IncomingMessage, response: ServerResponse): Promise<void> {
    for (const extension of this.options.extensions ?? []) if (await extension(request, response)) return;
    const url = new URL(request.url ?? '/', 'http://localhost');
    const path = url.pathname;
    const method = request.method ?? 'GET';
    const ws = this.workspace;

    if (path === '/api/health') return sendJson(response, 200, { protocol: PROTOCOL, workspace: ws.root, name: ws.name, revision: ws.revision });
    if (path === '/api/workspace' && method === 'GET') {
      return sendJson(response, 200, {
        name: ws.name,
        root: ws.root,
        revision: ws.revision,
        agent: this.agentInfo(),
        git: ws.git,
        plugins: ws.pluginInfos(),
        check: [...ws.check(), ...(await checkSkills(ws))],
      });
    }
    let match = /^\/api\/plugins\/([A-Z]+)\/documents$/.exec(path);
    if (match && method === 'GET') {
      const plugin = ws.plugin(match[1]!);
      if (!plugin) return sendJson(response, 404, { error: `no plugin ${match[1]}` });
      return sendJson(response, 200, { pluginKey: plugin.key, error: plugin.error, documents: plugin.error ? [] : ws.summaryList(plugin.key) });
    }
    match = /^\/api\/documents\/([^/]+)$/.exec(path);
    if (match && method === 'GET') {
      const key = decodeURIComponent(match[1]!);
      const view = ws.view(key);
      if (!view) return sendJson(response, 404, { error: `${match[1]} does not exist` });
      const base = url.searchParams.get('base');
      return sendJson(response, 200, base && base !== view.version ? { ...view, changes: ws.changes(key, base) } : view);
    }
    match = /^\/api\/documents\/([^/]+)\/file$/.exec(path);
    if (match && method === 'GET') {
      const file = ws.mainFile(decodeURIComponent(match[1]!));
      return file ? sendJson(response, 200, file) : sendJson(response, 404, { error: `${match[1]} does not exist` });
    }
    if (match && method === 'POST') {
      const parsed = editSchema.safeParse(await readBody(request));
      if (!parsed.success) return sendJson(response, 400, { error: 'an edit needs version and text' });
      const key = decodeURIComponent(match[1]!);
      const outcome = await this.run(() => ws.editMainFile(key, parsed.data.version, parsed.data.text, parsed.data.since));
      if (outcome.status === 'refused') return sendJson(response, 409, outcome);
      this.broadcast({ type: 'documents', revision: ws.revision, changed: [key] });
      return sendJson(response, 200, outcome);
    }
    match = /^\/api\/documents\/([^/]+)\/versions$/.exec(path);
    if (match && method === 'GET') {
      const versions = ws.storedVersions(decodeURIComponent(match[1]!));
      return versions ? sendJson(response, 200, { versions }) : sendJson(response, 404, { error: `${match[1]} does not exist` });
    }
    if (path === '/api/skills' && method === 'GET') {
      const skills = await listSkills(ws);
      return sendJson(response, 200, { skills: skills.map(({ name, description, scope, pluginKey }) => ({ name, description, scope, pluginKey })) });
    }
    match = /^\/api\/skills\/([\w.-]+)\/file$/.exec(path);
    if (match && method === 'GET') {
      try {
        return sendJson(response, 200, await readSkillFile(ws, match[1]!));
      } catch (error) {
        return sendJson(response, 404, { error: errorMessage(error) });
      }
    }
    if (match && method === 'POST') {
      const parsed = editSchema.safeParse(await readBody(request));
      if (!parsed.success) return sendJson(response, 400, { error: 'an edit needs version and text' });
      const name = match[1]!;
      const outcome = await this.run(() => editSkillFile(ws, name, parsed.data.version, parsed.data.text, parsed.data.since));
      return sendJson(response, outcome.status === 'refused' ? 409 : 200, outcome);
    }
    match = /^\/api\/skills\/([\w.-]+)$/.exec(path);
    if (match && method === 'GET') {
      // The _Skill_View_: the SKILL.md rendered with the plugin-kit Markdown like a document body, with source
      // positions, so that a comment on selected text says which line of which SKILL.md it is about.
      try {
        const { entry } = await viewSkill(ws, match[1]!);
        const file = await readSkillFile(ws, entry.name);
        const { body, bodyLine } = frontmatter(file.text);
        return sendJson(response, 200, { name: entry.name, description: entry.description, scope: entry.scope, pluginKey: entry.pluginKey, html: markdown(body, { file: file.file, line: bodyLine }).html });
      } catch (error) {
        return sendJson(response, 404, { error: errorMessage(error) });
      }
    }
    if (path === '/api/ui/sessions' && method === 'GET') return sendJson(response, 200, { sessions: this.browserSessions() });
    if (path === '/api/ui/open' && method === 'POST') {
      const parsed = openSchema.safeParse(await readBody(request));
      if (!parsed.success) return sendJson(response, 400, { error: 'ui open needs a target' });
      try {
        return sendJson(response, 200, this.openInBrowser(parsed.data.target, parsed.data.session));
      } catch (error) {
        return sendJson(response, 409, { error: errorMessage(error) });
      }
    }
    if (path === '/api/references' && method === 'GET') {
      const targets = (url.searchParams.get('targets') ?? '').split(',').filter(Boolean);
      return sendJson(response, 200, { references: targets.map((t) => ({ target: t, ...ws.resolve(t) })) });
    }
    if (path === '/api/messages' && method === 'GET') return sendJson(response, 200, { messages: this.queue.list().map(publicMessage) });
    if (path === '/api/messages' && method === 'POST') {
      const parsed = commentSchema.safeParse(await readBody(request));
      if (!parsed.success) return sendJson(response, 400, { error: parsed.error.issues.map((i) => i.message).join('; ') });
      const problem = [parsed.data.target, ...parsed.data.comments.map((c) => c.target)].map((t) => t && validTarget(t, ws)).find(Boolean);
      if (problem) return sendJson(response, 400, { error: problem });
      const comments: UserComment[] = parsed.data.comments.map((c) => {
        const comment: UserComment = { target: c.target, text: c.text };
        if (c.quote) comment.quote = c.quote;
        if (c.source) comment.source = c.source;
        return comment;
      });
      const input: Parameters<MessageQueue['add']>[0] = { kind: 'comment', comments };
      if (parsed.data.text?.trim() && parsed.data.target) {
        input.target = parsed.data.target;
        input.text = parsed.data.text;
      }
      const message = this.queue.add(input);
      return sendJson(response, 201, { message: publicMessage(message) });
    }
    if (path === '/api/messages/wait' && method === 'GET') {
      const timeout = url.searchParams.has('timeout') ? Number(url.searchParams.get('timeout')) : undefined;
      const abort = new AbortController();
      response.on('close', () => abort.abort());
      const messages = await this.queue.wait(timeout, abort.signal);
      if (abort.signal.aborted && !response.writableEnded && response.destroyed) return;
      return sendJson(response, 200, { messages: messages.map(publicMessage) });
    }
    if (path === '/api/actions' && method === 'POST') {
      const parsed = actionSchema.safeParse(await readBody(request));
      if (!parsed.success) return sendJson(response, 400, { error: parsed.error.issues.map((i) => i.message).join('; ') });
      const { key, version, event } = parsed.data;
      const actionEvent = Object.fromEntries(Object.entries(event).filter(([, v]) => v !== undefined)) as typeof event;
      const outcome = await this.run(() => ws.applyAction(key, actionEvent, version));
      if (outcome.status === 'applied' || outcome.status === 'sent') {
        const message = outcome.message ? this.queue.add({ kind: 'action', ...outcome.message }) : undefined;
        if (outcome.status === 'applied') this.broadcast({ type: 'documents', revision: ws.revision, changed: [key] });
        return sendJson(response, 200, { status: outcome.status, version: outcome.version, message: message && publicMessage(message) });
      }
      return sendJson(response, outcome.status === 'refused' ? 409 : 422, outcome);
    }
    if (path.startsWith('/api/')) return sendJson(response, 404, { error: `no route ${method} ${path}` });
    return this.serveWebapp(path, response);
  }

  /**
   * Serves a built file under `/assets/` (the `client/` folder of a plugin under `/assets/plugins/<KEY>/`); every other
   * path is a client route and gets index.html.
   */
  private async serveWebapp(path: string, response: ServerResponse): Promise<void> {
    const asset = path.startsWith('/assets/') && /^\/assets(\/[\w-][\w.-]*)+$/.test(path);
    const plugin = asset ? /^\/assets\/plugins\/([A-Z]+)\/(.+)$/.exec(path) : null;
    const directory = plugin ? this.workspace.pluginInfos().find((p) => p.key === plugin[1] && p.client)?.directory : undefined;
    const file = plugin ? (directory ? join(directory, 'client', plugin[2]!) : undefined) : join(this.webappDirectory, asset ? path.slice(1) : 'index.html');
    if (!file) return sendJson(response, 404, { error: `no file ${path}` });
    try {
      let body: Buffer | string = await readFile(file);
      // The configured colour scheme is in the page from the first paint; a browser's own choice replaces it.
      if (!asset) body = body.toString('utf8').replace('__ADOC_THEME__', this.workspace.config.ui.theme);
      response.writeHead(200, { 'content-type': WEBAPP_TYPES[extname(file)] ?? 'application/octet-stream', 'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
      response.end(body);
    } catch {
      if (asset) return sendJson(response, 404, { error: `no file ${path}` });
      response.writeHead(503, { 'content-type': 'text/plain; charset=utf-8' });
      response.end('The adoc web UI is not built; run pnpm build in the adoc repository.');
    }
  }
}
