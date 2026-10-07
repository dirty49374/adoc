import { mkdir, writeFile, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  AdocError,
  AdocServer,
  CONFIG_TEMPLATE,
  checkSkills,
  discoverHome,
  fetchGithubPlugins,
  formatCheck,
  installSkills,
  listServers,
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
} from '@garage49/adoc-core';
import type { CommandContext, CommandDefinition, CommandResult } from './contracts.js';
import { createMcpEndpoint, serveStdio } from './mcp.js';

type Options = Record<string, unknown> & { home?: string };

const WAIT_ROUND_MS = 60_000;

const opened = new WeakMap<CommandContext, Promise<Workspace>>();

/** Opens the workspace once per command run; the command and the _Skill_Check_ after it share it. */
function openWorkspace(options: Options, context: CommandContext): Promise<Workspace> {
  let workspace = opened.get(context);
  if (!workspace) {
    workspace = discoverHome(context.cwd, options.home, context.env).then((home) => Workspace.open(home, context.env));
    opened.set(context, workspace);
  }
  return workspace;
}

/** The _Skill_Check_ findings for the workspace of the command; none when there is no workspace. */
export async function skillWarnings(options: Options, context: CommandContext): Promise<string[]> {
  let workspace: Workspace;
  try {
    workspace = await openWorkspace(options, context);
  } catch {
    return [];
  }
  return (await checkSkills(workspace, context.env.HOME)).map((entry) => entry.message);
}

async function client(options: Options, context: CommandContext): Promise<ServerClient> {
  const home = await discoverHome(context.cwd, options.home, context.env);
  const server = await ServerClient.find(await readConfig(home, context.env), home.workspace);
  await server.ensure();
  return server;
}

function agentsOption(options: Options): string[] | undefined {
  return Array.isArray(options.agent) ? options.agent.map(String) : undefined;
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

/** `adoc plugin install` and `adoc plugin update`: one line per GitHub source; fails when one could not be fetched. */
async function fetchCommand(options: Options, context: CommandContext, choice: { update: boolean; keys?: string[] }): Promise<CommandResult> {
  const home = await discoverHome(context.cwd, options.home, context.env);
  const outcomes = await fetchGithubPlugins(await readConfig(home, context.env), choice, context.env);
  const text = outcomes.length
    ? outcomes.map((o) => `${o.key} ${o.status}${o.commit ? ` ${o.commit.slice(0, 12)}` : ''}${o.reason ? `: ${o.reason}` : ''}`).join('\n')
    : 'No GitHub plugin sources are declared.';
  const failed = outcomes.filter((o) => o.status === 'refused' || o.status === 'failed');
  if (failed.length) throw new AdocError('plugin.fetch', text);
  return { data: outcomes, text };
}

export const commands: readonly CommandDefinition[] = [
  {
    name: 'init',
    argument: '[directory]',
    options: [],
    summary: 'Create .adoc/adoc.yaml, declaring the five plugins of adoc, and a docs folder in a directory.',
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
      return { data: { configPath }, text: `Initialized ${configPath} with the five plugins of adoc.\nNext: adoc skill install, then adoc server run.` };
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
    name: 'server list',
    options: [],
    summary: 'List the adoc servers recorded on this computer, online or offline.',
    behavior:
      'Shows each recorded server with its workspace, URL, process id and status: online when its process runs and its URL answers for the same workspace, offline when it stopped without removing its record. Deletes the records of workspaces that no longer have .adoc/adoc.yaml. Works from any directory. With --output json, programs read the fields workspace, url, pid and status.',
    example: 'adoc server list --output json',
    async run(_args, _options, context) {
      const servers = await listServers(context.env);
      const rows = [['STATUS', 'URL', 'PID', 'WORKSPACE'], ...servers.map((s) => [s.status, s.url, String(s.pid), s.workspace])];
      return { data: servers, text: servers.length ? table(rows) : 'No adoc servers are recorded on this computer.' };
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
    behavior: 'Shows each plugin key in tab order, its number of documents (archived ones left out), its source and its description, or its load error.',
    example: 'adoc plugin list',
    async run(_args, options, context) {
      const plugins = (await openWorkspace(options, context)).pluginInfos();
      const rows = [['KEY', 'DOCUMENTS', 'SOURCE', 'DESCRIPTION'], ...plugins.map((p) => [p.key, String(p.documents), p.source, p.error ? `ERROR: ${p.error}` : p.description ?? ''])];
      return { data: plugins, text: plugins.length ? table(rows) : 'No plugins are declared in adoc.yaml.' };
    },
  },
  {
    name: 'plugin install',
    options: [],
    summary: 'Fetch the GitHub plugin sources that are declared but not fetched yet.',
    behavior:
      'Fetches each github:<owner>/<repo>/<folder>#<ref> source into plugins/<key in lowercase>/ next to the config file that declares it, and records the commit in plugins-lock.json there. npm sources are installed with npm. Then run adoc skill install, and restart a running server.',
    example: 'adoc plugin install',
    localOnly: true,
    async run(_args, options, context) {
      return fetchCommand(options, context, { update: false });
    },
  },
  {
    name: 'plugin update',
    argument: '[keys...]',
    options: [],
    summary: 'Fetch GitHub plugin sources again, all or the given plugin keys.',
    behavior: 'Refuses a fetched folder whose files were changed; copy it to another folder to change a plugin. npm sources are updated with npm. Then run adoc skill update, and restart a running server.',
    example: 'adoc plugin update SKETCH',
    localOnly: true,
    async run(args, options, context) {
      return fetchCommand(options, context, { update: true, keys: args });
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
    summary: 'List the agent skills adoc can show or install.',
    behavior: 'Lists the skill adoc (the assigned agent\'s workflow) and adoc-plugin-authoring in user scope, and the skill of every loaded plugin in the scope of that plugin, with its folder.',
    example: 'adoc skill list',
    async run(_args, options, context) {
      const skills = await listSkills(await openWorkspace(options, context));
      return { data: skills, text: table([['NAME', 'SCOPE', 'DESCRIPTION'], ...skills.map((s) => [s.name, s.scope, s.description])]) };
    },
  },
  {
    name: 'skill view',
    argument: '<name>',
    options: [],
    summary: 'Show one agent skill by its name from adoc skill list.',
    behavior: 'Prints the SKILL.md of the skill without its front matter. Plugin skills are named adoc-<plugin key in lowercase>, such as adoc-todo.',
    example: 'adoc skill view adoc-todo',
    async run(args, options, context) {
      const { entry, body } = await viewSkill(await openWorkspace(options, context), args[0]!);
      return { data: { ...entry, body }, text: body };
    },
  },
  ...(['install', 'update'] as const).map(
    (verb): CommandDefinition => ({
      name: `skill ${verb}`,
      options: [['--agent <names...>', 'the agents to install for, such as claude-code codex (default: what the skills CLI detects)']],
      summary: verb === 'install' ? 'Install every agent skill for the agents.' : 'Install every agent skill again, replacing the installed copies.',
      behavior:
        'Runs the Vercel skills CLI (npx -y skills@1, or ADOC_SKILLS_CLI) as `skills add <folder>` for each skill listed by adoc skill list: user scope (--global) for adoc and adoc-plugin-authoring and for plugins outside the workspace, project scope for plugins inside it. Only the skill/ folder is installed, never plugin code.',
      example: `adoc skill ${verb} --agent claude-code codex`,
      localOnly: true,
      async run(_args, options, context) {
        const skills = await installSkills(await openWorkspace(options, context), { agents: agentsOption(options), env: context.env });
        return { data: skills, text: `Installed ${skills.length} skills: ${skills.map((s) => `${s.name} (${s.scope})`).join(', ')}` };
      },
    }),
  ),
  {
    name: 'skill uninstall',
    options: [['--agent <names...>', 'the agents to remove the skills from (default: what the skills CLI detects)']],
    summary: 'Remove every agent skill of the workspace from the agents.',
    behavior: 'Runs `skills remove <names>` of the Vercel skills CLI for the skills listed by adoc skill list, per scope.',
    example: 'adoc skill uninstall',
    localOnly: true,
    async run(_args, options, context) {
      const skills = await uninstallSkills(await openWorkspace(options, context), { agents: agentsOption(options), env: context.env });
      return { data: skills, text: `Removed ${skills.map((s) => s.name).join(', ')}` };
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
  skill: 'Show and install agent skills',
  ui: 'Inspect and control browser sessions of the web UI',
  agent: 'Claim and show the assigned agent',
};
