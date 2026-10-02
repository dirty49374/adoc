import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { TransportConfig } from './config.js';
import { errorMessage } from './errors.js';
import { formatMessage, type MessageQueue, type UserMessage } from './messages.js';

const run = promisify(execFile);

/**
 * _User_Message_Transport_: how a held message reaches the _Assigned_Agent_.
 * A push transport delivers each message as soon as it is created; the wait transport leaves
 * messages held until `adoc message wait` takes them.
 */
export interface MessageTransport {
  readonly kind: string;
  /** Pushes one message; resolves when delivered, rejects when delivery failed. Absent for the wait transport. */
  push?(message: UserMessage): Promise<void>;
}

export type CommandRunner = (file: string, args: string[]) => Promise<void>;

const defaultRunner: CommandRunner = async (file, args) => {
  await run(file, args, { timeout: 30_000 });
};

export function createTransport(config: TransportConfig, runner: CommandRunner = defaultRunner): MessageTransport {
  switch (config.kind) {
    case 'wait':
      return { kind: 'wait' };
    case 'hc':
      return {
        kind: 'hc',
        push: (message) =>
          runner('hc', ['send', '--title', `adoc message ${message.number}`, '--delivery-timeout', '30m', '--no-reply-needed', config.target, formatMessage(message)]),
      };
    case 'herdr':
      return { kind: 'herdr', push: (message) => runner('herdr', ['agent', 'prompt', config.target, formatMessage(message)]) };
  }
}

/** Connects a push transport to the queue: every new message, and every message still held after a failure, is retried in order. */
export function attachTransport(queue: MessageQueue, transport: MessageTransport, log: (line: string) => void): void {
  const push = transport.push;
  if (!push) return;
  let busy = false;
  let again = false;
  const flush = async (): Promise<void> => {
    if (busy) {
      again = true;
      return;
    }
    busy = true;
    try {
      for (const message of queue.list()) {
        try {
          await push(message);
          queue.markDelivered([message.number]);
        } catch (error) {
          log(`adoc: ${transport.kind} delivery of message ${message.number} failed: ${errorMessage(error)}`);
          again = false;
          return;
        }
      }
    } finally {
      busy = false;
    }
    if (again) {
      again = false;
      await flush();
    }
  };
  queue.on('added', () => void flush());
}
