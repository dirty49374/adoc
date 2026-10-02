import { readdir, readFile } from 'node:fs/promises';
import { createConnection } from 'node:net';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { AdocError } from './errors.js';

/** One pane as herdr's `session.snapshot` reports it. */
export interface HerdrPane {
  pane_id: string;
  terminal_id: string;
  agent?: string;
  agent_status?: string;
  agent_session?: { agent?: string; kind?: string; value?: string };
}

let requestId = 0;

/** Sends one request over a herdr session socket (NDJSON) and returns its result. */
export function herdrCall<T>(socketPath: string, method: string, params: unknown = {}): Promise<T> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(socketPath);
    let buffer = '';
    const id = `adoc-${++requestId}`;
    socket.setTimeout(10_000, () => socket.destroy(new Error(`herdr ${method} timed out`)));
    socket.on('connect', () => socket.write(JSON.stringify({ id, method, params }) + '\n'));
    socket.on('data', (chunk) => {
      buffer += chunk.toString('utf8');
      const end = buffer.indexOf('\n');
      if (end < 0) return;
      socket.end();
      const reply = JSON.parse(buffer.slice(0, end)) as { result?: T; error?: { code?: string; message?: string } };
      if (reply.error) reject(new AdocError('herdr.error', `herdr ${method}: ${reply.error.message ?? reply.error.code}`));
      else resolve(reply.result as T);
    });
    socket.on('error', (error) => reject(new AdocError('herdr.unreachable', `herdr socket ${socketPath}: ${error.message}`)));
  });
}

/**
 * Subscribes to herdr events on a session socket; the connection stays open.
 * Returns a function that closes the subscription.
 */
export function herdrSubscribe(socketPath: string, subscriptions: unknown[], onEvent: (event: { event?: string; data?: unknown }) => void, onClose: () => void): () => void {
  const socket = createConnection(socketPath);
  let buffer = '';
  socket.on('connect', () => socket.write(JSON.stringify({ id: `adoc-sub-${++requestId}`, method: 'events.subscribe', params: { subscriptions } }) + '\n'));
  socket.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let end;
    while ((end = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, end);
      buffer = buffer.slice(end + 1);
      try {
        const message = JSON.parse(line) as { event?: string; data?: unknown };
        if (message.event) onEvent(message);
      } catch {
        // Ignore a malformed line.
      }
    }
  });
  socket.on('close', onClose);
  socket.on('error', () => undefined);
  return () => socket.destroy();
}

/** The socket of every herdr session on this computer, by session name. */
export async function herdrSessions(home = homedir()): Promise<Array<{ name: string; socket: string }>> {
  const root = join(home, '.config', 'herdr', 'sessions');
  try {
    const names = await readdir(root);
    return names.map((name) => ({ name, socket: join(root, name, 'herdr.sock') }));
  } catch {
    return [];
  }
}

export async function herdrPanes(socketPath: string): Promise<HerdrPane[]> {
  const result = await herdrCall<{ snapshot: { panes: HerdrPane[] } }>(socketPath, 'session.snapshot');
  return result.snapshot.panes;
}

/** Whether this process runs under a shared agent daemon such as the Codex app-server, whose HERDR_PANE_ID is not the agent's. */
export async function underSharedDaemon(pid = process.ppid): Promise<boolean> {
  for (let current = pid, depth = 0; current > 1 && depth < 64; depth++) {
    try {
      const args = (await readFile(`/proc/${current}/cmdline`, 'utf8')).split('\0').join(' ');
      if (args.includes('codex') && args.split(/\s+/).includes('app-server')) return true;
      const stat = await readFile(`/proc/${current}/stat`, 'utf8');
      current = Number(stat.slice(stat.lastIndexOf(')') + 2).split(' ')[1]);
    } catch {
      return false;
    }
  }
  return false;
}

/** The session-id variables that agent runtimes export to their tool processes. */
const SESSION_VARIABLES: ReadonlyArray<readonly [string, string]> = [
  ['claude', 'CLAUDE_CODE_SESSION_ID'],
  ['codex', 'CODEX_SESSION_ID'],
];

export interface ResolvedPane {
  herdrSession: string;
  socket: string;
  pane: HerdrPane;
  via: 'option' | 'session-id' | 'environment';
}

/**
 * Finds the caller's herdr pane, in the order of _Agent_Claim_Command_: `--pane`, then the pane whose
 * recorded agent session is the caller's session id, then HERDR_PANE_ID unless under a shared daemon.
 */
export async function resolveAgentPane(env: NodeJS.ProcessEnv, options: { pane?: string; herdrSession?: string } = {}): Promise<ResolvedPane> {
  const sessions = (await herdrSessions(env.HOME)).filter((s) => !options.herdrSession || s.name === options.herdrSession);
  if (!sessions.length) throw new AdocError('claim.herdr', 'No herdr session found on this computer; adoc agent claim needs herdr.');
  const inSession = async (paneId: string, preferred?: string) => {
    const ordered = preferred ? [...sessions.filter((s) => s.socket === preferred), ...sessions.filter((s) => s.socket !== preferred)] : sessions;
    for (const session of ordered) {
      const pane = (await herdrPanes(session.socket).catch(() => [])).find((p) => p.pane_id === paneId);
      if (pane) return { session, pane };
    }
    return undefined;
  };
  if (options.pane) {
    const found = await inSession(options.pane, env.HERDR_SOCKET_PATH);
    if (!found) throw new AdocError('claim.pane', `No herdr pane ${options.pane}.`);
    return { herdrSession: found.session.name, socket: found.session.socket, pane: found.pane, via: 'option' };
  }
  for (const [, variable] of SESSION_VARIABLES) {
    const id = env[variable];
    if (!id) continue;
    for (const session of sessions) {
      const pane = (await herdrPanes(session.socket).catch(() => [])).find((p) => p.agent_session?.value === id);
      if (pane) return { herdrSession: session.name, socket: session.socket, pane, via: 'session-id' };
    }
  }
  if (env.HERDR_PANE_ID && !(await underSharedDaemon())) {
    const found = await inSession(env.HERDR_PANE_ID, env.HERDR_SOCKET_PATH);
    if (found) return { herdrSession: found.session.name, socket: found.session.socket, pane: found.pane, via: 'environment' };
  }
  throw new AdocError('claim.unknown', 'Cannot tell which herdr pane this agent runs in; run adoc agent claim --pane <pane id> (see herdr pane list).');
}
