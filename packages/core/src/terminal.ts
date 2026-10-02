import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import type { WebSocket } from 'ws';
import type { AgentClaim } from './claim.js';

type Mode = 'observe' | 'control';

interface Stream {
  mode: Mode;
  child: ChildProcessWithoutNullStreams;
  cols: number;
  rows: number;
}

/**
 * _Agent_Terminal_Stream_: relays the claimed pane's terminal between herdr and browser sockets.
 * One socket at a time controls the terminal (`herdr terminal session control`); every other socket observes.
 */
export class TerminalRelay {
  private readonly streams = new Map<WebSocket, Stream>();

  constructor(
    private readonly claim: () => AgentClaim | undefined,
    private readonly log: (line: string) => void,
  ) {}

  /** Starts or restarts the stream of a socket in the given mode and size; taking control downgrades the previous controller. */
  open(ws: WebSocket, mode: Mode, cols: number, rows: number): void {
    const claim = this.claim();
    if (!claim) {
      send(ws, { type: 'terminal.closed', reason: 'no-claim' });
      return;
    }
    if (mode === 'control') {
      for (const [other, stream] of this.streams) if (other !== ws && stream.mode === 'control') this.open(other, 'observe', stream.cols, stream.rows);
    }
    this.stop(ws);
    const args = ['terminal', 'session', mode, claim.pane, '--cols', String(cols), '--rows', String(rows)];
    const child = spawn('herdr', args, { env: { ...process.env, HERDR_SOCKET_PATH: claim.socket } });
    const stream: Stream = { mode, child, cols, rows };
    this.streams.set(ws, stream);
    let buffer = '';
    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      let end;
      while ((end = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        try {
          const record = JSON.parse(line) as { type?: string };
          if (record.type === 'terminal.frame' || record.type === 'terminal.closed') send(ws, record);
        } catch {
          // Ignore a malformed line.
        }
      }
    });
    child.stderr.on('data', (chunk: Buffer) => this.log(`adoc: herdr terminal ${mode}: ${chunk.toString('utf8').trim()}`));
    child.on('exit', () => {
      if (this.streams.get(ws)?.child === child) {
        this.streams.delete(ws);
        send(ws, { type: 'terminal.closed', reason: 'stream-ended' });
      }
    });
    send(ws, { type: 'terminal.mode', mode });
  }

  /** Sends keys or text typed in the controlling browser. */
  input(ws: WebSocket, data: string): void {
    this.command(ws, { type: 'terminal.input', text: data });
  }

  resize(ws: WebSocket, cols: number, rows: number): void {
    const stream = this.streams.get(ws);
    if (!stream) return;
    stream.cols = cols;
    stream.rows = rows;
    if (stream.mode === 'control') this.command(ws, { type: 'terminal.resize', cols, rows });
    else this.open(ws, 'observe', cols, rows);
  }

  /** Scrolls the pane's view through its scrollback: positive lines scroll up (back in history), negative down. */
  scroll(ws: WebSocket, lines: number): void {
    if (lines === 0) return;
    this.command(ws, { type: 'terminal.scroll', direction: lines > 0 ? 'up' : 'down', lines: Math.min(Math.abs(Math.round(lines)), 200) });
  }

  /** Stops the stream of a socket; a controller releases the pane first so that it gets its own size back. */
  stop(ws: WebSocket): void {
    const stream = this.streams.get(ws);
    if (!stream) return;
    this.streams.delete(ws);
    if (stream.mode === 'control' && stream.child.stdin.writable) stream.child.stdin.write(JSON.stringify({ type: 'terminal.release' }) + '\n');
    stream.child.stdin.end();
    setTimeout(() => stream.child.kill(), 500).unref();
  }

  /** Ends every stream, for example when the claim changes; browsers reopen with the new pane. */
  stopAll(reason: string): void {
    for (const ws of [...this.streams.keys()]) {
      this.stop(ws);
      send(ws, { type: 'terminal.closed', reason });
    }
  }

  private command(ws: WebSocket, command: unknown): void {
    const stream = this.streams.get(ws);
    if (stream?.mode === 'control' && stream.child.stdin.writable) stream.child.stdin.write(JSON.stringify(command) + '\n');
  }
}

function send(ws: WebSocket, message: unknown): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(message));
}
