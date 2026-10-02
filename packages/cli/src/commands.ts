import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  AdocError,
  AdocServer,
  CONFIG_TEMPLATE,
  DEFAULT_SKILL_DIRECTORY,
  discoverHome,
  formatCheck,
  installSkills,
  listSkills,
  readClaim,
  readConfig,
  resolveAgentPane,
  writeClaim,
  CLAIM_FILE,
  ServerClient,
  uninstallSkills,
  viewSkill,
  Workspace,
} from '@adoc/core';
import type { CommandContext, CommandDefinition, CommandResult } from './contracts.js';
import { createMcpEndpoint, serveStdio } from './mcp.js';

type Options = Record<string, unknown> & { home?: string };

const WAIT_ROUND_MS = 60_000;

async function openWorkspace(options: Options, context: CommandContext): Promise<Workspace> {
  return Workspace.open(await discoverHome(context.cwd, options.home, context.env));
}

async function client(options: Options, context: CommandContext): Promise<ServerClient> {
  const home = await discoverHome(context.cwd, options.home, context.env);
  const server = await ServerClient.find(await readConfig(home), home.workspace);
  await server.ensure();
  return server;
}

/** An ISO time as local `YYYY-MM-DD HH:MM`. */
function localTime(iso: string): string {
  const t = new Date(iso);
  const two = (n: number) => String(n).padStart(2, '0');
  return `${t.getFullYear()}-${two(t.getMonth() + 1)}-${two(t.getDate())} ${two(t.getHours())}:${two(t.getMinutes())}`;
}

/** The options of the _Document_Find_Command_. */
function findOptions(options: Options): { pluginKey?: string; archived: boolean } {
  return { ...(typeof options.plugin === 'string' ? { pluginKey: options.plugin } : {}), archived: options.archived === true };
}

function table(rows: string[][]): string {
  if (!rows.length) return '';
  const widths = rows[0]!.map((_, i) => Math.max(...rows.map((r) => (r[i] ?? '').length)));
  return rows.map((r) => r.map((cell, i) => (i === r.length - 1 ? cell : cell.padEnd(widths[i]!))).join('  ')).join('\n');
}

/** Runs until SIGINT, SIGTERM or the given promise settles. */
async function foreground(stop: () => Promise<void>): Promise<void> {
  await new Promise<void>((done) => {
    const finish = () => {
      process.off('SIGINT', finish);
      process.off('SIGTERM', finish);
      void stop().then(done, done);
    };
    process.on('SIGINT', finish);
    process.on('SIGTERM', finish);
  });
}

interface MessagesBody {
  messages: Array<Record<string, unknown> & { formatted: string }>;
}

function messagesResult(body: MessagesBody, empty: string): CommandResult {
  const data = body.messages.map(({ formatted: _formatted, ...fields }) => fields);
  return { data, text: body.messages.length ? body.messages.map((m) => m.formatted).join('\n') : empty };
}

export const commands: readonly CommandDefinition[] = [
  {
    name: 'init',
    argument: '[directory]',
    options: [],
    summary: 'Create .adoc/adoc.yaml and a docs folder in a directory.',
    behavior: 'Refuses when the directory already has an .adoc folder with adoc.yaml. Does not run git init; keep the workspace in a git repository so that the agent can commit.',
    example: 'adoc init .',
    localOnly: true,
    async run(args, _options, context) {
      const root = resolve(context.cwd, args[0] ?? '.');
      const configPath = join(root, '.adoc', 'adoc.yaml');
      try {
        await access(configPath);
        throw new AdocError('init.exists', `${configPath} already exists.`);
      } catch (error) {
        if (error instanceof AdocError) throw error;
      }
      await mkdir(join(root, '.adoc'), { recursive: true });
      await mkdir(join(root, 'docs'), { recursive: true });
      await writeFile(configPath, CONFIG_TEMPLATE);
      await writeFile(join(root, '.adoc', '.gitignore'), `${CLAIM_FILE}\n`);
      return { data: { configPath }, text: `Initialized ${configPath}\nNext: declare plugins in it, then run adoc server run.` };
    },
  },
  {
    name: 'server run',
    options: [
      ['--host <address>', 'override server.host'],
      ['--port <port>', 'override server.port'],
      ['--agent-pane <pane>', 'claim this herdr pane for the assigned agent before starting'],
    ],
    summary: 'Run the adoc server for this workspace in the foreground.',
    behavior:
      'Serves the web UI, the REST API, live events and MCP at /mcp; watches the watch paths; holds user messages until delivery. Refuses to start on a port in use. Prints the adoc check report at start. Ctrl-C stops it.',
    example: 'adoc server run --port 7700',
    localOnly: true,
    async run(_args, options, context) {
      const workspace = await openWorkspace(options, context);
      if (typeof options.agentPane === 'string') await writeClaim(workspace.home, await resolveAgentPane(context.env, { pane: options.agentPane }));
      const serverOptions: ConstructorParameters<typeof AdocServer>[1] = { extensions: [createMcpEndpoint(context)], log: (line) => context.streams.stderr(line + '\n') };
      if (typeof options.host === 'string') serverOptions.host = options.host;
      if (options.port !== undefined) serverOptions.port = Number(options.port);
      const server = new AdocServer(workspace, serverOptions);
      await server.start();
      await foreground(() => server.stop());
    },
  },
  {
    name: 'mcp run',
    options: [
      ['--with-server', 'also host the adoc server in this process'],
      ['--port <port>', 'override server.port; requires --with-server'],
    ],
    summary: 'Serve the adoc MCP tool over stdio.',
    behavior:
      'Exposes one tool, adoc({cmd, stdin}), that runs any adoc command without the executable prefix. Standard output carries only MCP messages. With --with-server the adoc server runs in the same process and stops when stdio closes.',
    example: 'adoc mcp run --with-server',
    localOnly: true,
    async run(_args, options, context) {
      let server: AdocServer | undefined;
      if (options.withServer) {
        const workspace = await openWorkspace(options, context);
        const serverOptions: ConstructorParameters<typeof AdocServer>[1] = { extensions: [createMcpEndpoint(context)], log: (line) => context.streams.stderr(line + '\n') };
        if (options.port !== undefined) serverOptions.port = Number(options.port);
        server = new AdocServer(workspace, serverOptions);
        await server.start();
      } else if (options.port !== undefined) {
        throw new AdocError('cli.option', '--port requires --with-server');
      }
      await serveStdio(context);
      await server?.stop();
    },
  },
  {
    name: 'message wait',
    options: [['--timeout <seconds>', 'return with no message after this many seconds']],
    summary: 'Wait for user messages and receive every held message.',
    behavior:
      'Blocks until the adoc server holds at least one user message, then returns all held messages in creation order, each in the adoc message format, and the server forgets them. Without --timeout it waits indefinitely. Fails when no adoc server is running.',
    example: 'adoc message wait --timeout 600',
    async run(_args, options, context) {
      const server = await client(options, context);
      // Long-poll in rounds shorter than fetch's own response timeout, until messages arrive or --timeout ends.
      const deadline = options.timeout !== undefined ? Date.now() + Number(options.timeout) * 1000 : Infinity;
      for (;;) {
        const round = Math.max(0, Math.min(WAIT_ROUND_MS, deadline - Date.now()));
        const body = await server.get<MessagesBody>(`/api/messages/wait?timeout=${round}`);
        if (body.messages.length || Date.now() >= deadline) return messagesResult(body, '(no messages)');
      }
    },
  },
  {
    name: 'message list',
    options: [],
    summary: 'Show held user messages without delivering them.',
    behavior: 'Lists the messages the adoc server still holds, in the adoc message format. Fails when no adoc server is running.',
    example: 'adoc message list',
    async run(_args, options, context) {
      const server = await client(options, context);
      return messagesResult(await server.get<MessagesBody>('/api/messages'), '(no held messages)');
    },
  },
  {
    name: 'plugin list',
    options: [],
    summary: 'List the plugins declared in adoc.yaml.',
    behavior: 'Shows each plugin key, its source, its document layout, its number of documents and its load error, if any.',
    example: 'adoc plugin list',
    async run(_args, options, context) {
      const plugins = (await openWorkspace(options, context)).pluginInfos();
      const rows = [['KEY', 'DOCUMENTS', 'LAYOUT', 'DESCRIPTION'], ...plugins.map((p) => [p.key, String(p.documents), p.layout ?? '-', p.error ? `ERROR: ${p.error}` : p.description ?? ''])];
      return { data: plugins, text: plugins.length ? table(rows) : 'No plugins are declared in adoc.yaml.' };
    },
  },
  {
    name: 'document list',
    options: [
      ['--plugin <key>', 'only documents of this plugin key, such as TASK'],
      ['--archived', 'only archived documents (inside an _archive folder)'],
    ],
    summary: 'List documents, newest first, without archived ones.',
    behavior: 'Shows the key, status, last update, title and path of every document, by last update, newest first. Archived documents (inside an _archive folder) are left out; --archived shows only them.',
    example: 'adoc document list --plugin TASK',
    async run(_args, options, context) {
      const found = (await openWorkspace(options, context)).findDocuments(findOptions(options));
      const rows = [['KEY', 'STATUS', 'UPDATED', 'TITLE', 'PATH'], ...found.map((d) => [d.key, d.summary?.status ?? 'ERROR', localTime(d.updatedAt), d.summary?.title ?? d.error ?? '', d.path])];
      return { data: found, text: found.length ? table(rows) : `No ${options.archived ? 'archived ' : ''}documents.` };
    },
  },
  {
    name: 'document search',
    argument: '<text>',
    options: [
      ['--plugin <key>', 'only documents of this plugin key, such as TASK'],
      ['--archived', 'only archived documents (inside an _archive folder)'],
    ],
    summary: 'Find the lines of documents that contain a text, without archived documents.',
    behavior: 'Prints every line of a document file that contains the text, case-insensitive, as path:line, key and line. Archived documents (inside an _archive folder) are left out; --archived searches only them.',
    example: 'adoc document search "cursor paging"',
    async run(args, options, context) {
      const hits = (await openWorkspace(options, context)).searchDocuments(args[0]!, findOptions(options));
      return { data: hits, text: hits.length ? hits.map((h) => `${h.path}:${h.line}  ${h.key}  ${h.text}`).join('\n') : `No ${options.archived ? 'archived ' : ''}document contains "${args[0]}".` };
    },
  },
  {
    name: 'skill list',
    options: [],
    summary: 'List the agent guides adoc can show or install.',
    behavior: 'Lists the adoc workflow guide, the plugin authoring guide and one guide per loaded plugin.',
    example: 'adoc skill list',
    async run(_args, options, context) {
      const skills = listSkills(await openWorkspace(options, context));
      return { data: skills, text: table([['NAME', 'DESCRIPTION'], ...skills.map((s) => [s.name, s.description])]) };
    },
  },
  {
    name: 'skill view',
    argument: '<name>',
    options: [],
    summary: 'Show one agent guide by its name from adoc skill list.',
    behavior: 'Prints the guide as Markdown. Plugin guides are named adoc-<plugin key in lowercase>, such as adoc-todo.',
    example: 'adoc skill view adoc-todo',
    async run(args, options, context) {
      const { entry, body } = await viewSkill(await openWorkspace(options, context), args[0]!);
      return { data: { ...entry, body }, text: body };
    },
  },
  ...(['install', 'update'] as const).map(
    (verb): CommandDefinition => ({
      name: `skill ${verb}`,
      options: [['--dir <directory>', `skill directory relative to the workspace (default ${DEFAULT_SKILL_DIRECTORY})`]],
      summary: verb === 'install' ? 'Install every agent guide as a skill in the workspace.' : 'Rewrite the installed skills and remove stale ones.',
      behavior: `Writes <dir>/<name>/SKILL.md for each guide listed by adoc skill list and records the managed names in .adoc/skills.json; names no longer listed are removed.`,
      example: `adoc skill ${verb}`,
      localOnly: true,
      async run(_args, options, context) {
        const directory = typeof options.dir === 'string' ? options.dir : DEFAULT_SKILL_DIRECTORY;
        const skills = await installSkills(await openWorkspace(options, context), directory);
        return { data: skills, text: `Installed ${skills.length} skills in ${directory}: ${skills.map((s) => s.name).join(', ')}` };
      },
    }),
  ),
  {
    name: 'skill uninstall',
    options: [],
    summary: 'Remove every skill installed by adoc skill install.',
    behavior: 'Removes the names recorded in .adoc/skills.json and the record itself.',
    example: 'adoc skill uninstall',
    localOnly: true,
    async run(_args, options, context) {
      const names = await uninstallSkills(await openWorkspace(options, context));
      return { data: names, text: names.length ? `Removed ${names.join(', ')}` : 'No adoc skills are installed.' };
    },
  },
  {
    name: 'ui list',
    options: [],
    summary: 'List the browser sessions of the adoc web UI, most recent first.',
    behavior: 'Shows each browser tab connected to the adoc server: its session id, whether it is connected, its last access and the page it shows. Fails when no adoc server is running.',
    example: 'adoc ui list',
    async run(_args, options, context) {
      const server = await client(options, context);
      const { sessions } = await server.get<{ sessions: Array<{ id: string; connected: boolean; lastAccess: string; location: string }> }>('/api/ui/sessions');
      const rows = [['SESSION', 'STATE', 'LAST ACCESS', 'LOCATION'], ...sessions.map((s) => [s.id, s.connected ? 'connected' : 'closed', s.lastAccess, s.location])];
      return { data: sessions, text: sessions.length ? table(rows) : 'No browser session has connected yet.' };
    },
  },
  {
    name: 'ui open',
    argument: '<target>',
    options: [['--session <id>', 'the browser session to move (default: the connected session accessed last)']],
    summary: 'Show a document, an anchor or a plugin in a browser session.',
    behavior:
      'Sends the browser session accessed most recently, or the one named by --session, to the target: a document key such as NOTE-261002-idea, a key with an anchor such as TASK-a#goal, or a plugin key such as TODO. Fails when no browser session is connected.',
    example: 'adoc ui open NOTE-261002-note-plugin',
    async run(args, options, context) {
      const server = await client(options, context);
      const body: { target: string; session?: string } = { target: args[0]! };
      if (typeof options.session === 'string') body.session = options.session;
      const opened = await server.post<{ session: string; location: string }>('/api/ui/open', body);
      return { data: opened, text: `Opened ${opened.location} in browser session ${opened.session}.` };
    },
  },
  {
    name: 'agent claim',
    options: [
      ['--pane <pane>', 'the herdr pane to claim, such as w2B:p1'],
      ['--herdr-session <name>', 'look for the pane only in this herdr session'],
    ],
    summary: 'Make your herdr pane the assigned agent of this workspace.',
    behavior:
      'Finds your herdr pane: --pane if given; else the pane whose agent session is your session id (CLAUDE_CODE_SESSION_ID or CODEX_SESSION_ID); else HERDR_PANE_ID, unless you run under a shared agent daemon. Writes .adoc/claim.yaml; a running adoc server follows it at once, pushes user messages to that pane and shows its terminal. Claiming from another pane takes the role over.',
    example: 'adoc agent claim',
    async run(_args, options, context) {
      const home = await discoverHome(context.cwd, options.home, context.env);
      const resolveOptions: { pane?: string; herdrSession?: string } = {};
      if (typeof options.pane === 'string') resolveOptions.pane = options.pane;
      if (typeof options.herdrSession === 'string') resolveOptions.herdrSession = options.herdrSession;
      const resolved = await resolveAgentPane(context.env, resolveOptions);
      const claim = await writeClaim(home, resolved);
      return { data: { ...claim, via: resolved.via }, text: `Claimed herdr pane ${claim.pane} (${claim.herdrSession}${claim.agent ? `, ${claim.agent}` : ''}) as the assigned agent, found by ${resolved.via}.` };
    },
  },
  {
    name: 'agent show',
    options: [],
    summary: 'Show which herdr pane is the assigned agent.',
    behavior: 'Prints the claim in .adoc/claim.yaml, or says that no agent has claimed the workspace.',
    example: 'adoc agent show',
    async run(_args, options, context) {
      const claim = await readClaim(await discoverHome(context.cwd, options.home, context.env));
      return { data: claim ?? null, text: claim ? `herdr pane ${claim.pane} (${claim.herdrSession}${claim.agent ? `, ${claim.agent}` : ''}), claimed ${claim.claimedAt}` : 'No agent has claimed this workspace; run adoc agent claim in the agent pane.' };
    },
  },
  {
    name: 'check',
    options: [],
    summary: 'Report every warning and error of the workspace.',
    behavior:
      'Reports plugins that fail to load, duplicate document keys, invalid local ids, files whose prefix is not a declared plugin key, documents that fail to parse and broken document references. Changes nothing. Exits with status 1 when it reports an error.',
    example: 'adoc check',
    async run(_args, options, context) {
      const entries = (await openWorkspace(options, context)).check();
      return { data: entries, text: formatCheck(entries), exitCode: entries.some((e) => e.level === 'error') ? 1 : 0 };
    },
  },
];

export const groups: Record<string, string> = {
  server: 'Run the adoc server',
  mcp: 'Serve the adoc MCP tool',
  message: 'Receive user messages',
  plugin: 'Inspect declared plugins',
  document: 'Find documents',
  skill: 'Show and install agent guides',
  ui: 'Inspect and control browser sessions of the web UI',
  agent: 'Claim and show the assigned agent',
};
