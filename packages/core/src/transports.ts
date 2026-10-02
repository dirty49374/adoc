import type { AgentClaim } from './claim.js';
import type { TransportConfig } from './config.js';
import { herdrCall } from './herdr.js';
import { errorMessage } from './errors.js';
import { formatMessage, type MessageQueue, type UserMessage } from './messages.js';

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

/** The current _Agent_Claim_, read when a message is pushed. */
export type ClaimSource = () => AgentClaim | undefined;

export function createTransport(config: TransportConfig, claim: ClaimSource = () => undefined): MessageTransport {
  switch (config.kind) {
    case 'wait':
      return { kind: 'wait' };
    case 'herdr':
      return {
        kind: 'herdr',
        push: async (message) => {
          const current = claim();
          if (!current) throw new Error('no agent has claimed this workspace; run adoc agent claim in the agent pane');
          const text = formatMessage(message);
          try {
            await herdrCall(current.socket, 'agent.prompt', { target: current.pane, text });
          } catch (error) {
            // herdr refuses agent.prompt until it has detected an agent in the pane; type the message instead.
            if (!/not found/.test(errorMessage(error))) throw error;
            await herdrCall(current.socket, 'pane.send_input', { pane_id: current.pane, text, keys: ['enter'] });
          }
        },
      };
  }
}

/**
 * Connects a push transport to the queue: every new message, and every message still held after a failure, is retried in order.
 * Returns a function that retries the held messages, for example after a new _Agent_Claim_.
 */
export function attachTransport(queue: MessageQueue, transport: MessageTransport, log: (line: string) => void): () => void {
  const push = transport.push;
  if (!push) return () => undefined;
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
  return () => void flush();
}
