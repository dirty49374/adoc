import { EventEmitter } from 'node:events';
import { stringify } from 'yaml';

/** _User_Message_Target_: one of five levels. */
export type MessageTarget =
  | { level: 'workspace' }
  | { level: 'plugin'; pluginKey: string }
  | { level: 'document'; key: string }
  | { level: 'anchor'; key: string; anchor: string }
  | { level: 'skill'; name: string };

/** One _User_Comment_ inside a comment message. */
export interface UserComment {
  target: MessageTarget;
  text: string;
  quote?: string;
  source?: string;
}

/** A _User_Comment_Message_: the composer text with its target, and the draft comments, in the order added. */
export interface CommentInput {
  target?: MessageTarget;
  text?: string;
  comments: UserComment[];
}

export interface ActionMessageInput {
  target: MessageTarget;
  action: string;
  value: string;
  to?: string;
  applied: boolean;
  text: string;
}

/** A held _User_Message_. */
export type UserMessage =
  | ({ number: number; kind: 'comment'; createdAt: string } & CommentInput)
  | ({ number: number; kind: 'action'; createdAt: string } & ActionMessageInput);

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
    case 'skill':
      return `skill ${target.name}`;
  }
}

/** The structured fields of a message, in _User_Message_Format_ order. */
export function messageFields(message: UserMessage): Record<string, unknown> {
  const fields: Record<string, unknown> = { number: message.number, kind: message.kind };
  if (message.kind === 'comment') {
    if (message.target) fields.target = formatTarget(message.target);
    if (message.text) fields.text = message.text;
    if (message.comments.length) fields.comments = message.comments.map((comment) => {
      const entry: Record<string, unknown> = { target: formatTarget(comment.target) };
      if (comment.source) entry.source = comment.source;
      if (comment.quote) entry.quote = comment.quote;
      entry.text = comment.text;
      return entry;
    });
  } else {
    fields.target = formatTarget(message.target);
    fields.action = message.action;
    fields.value = message.value;
    if (message.to !== undefined) fields.to = message.to;
    fields.applied = message.applied;
    fields.text = message.text;
  }
  return fields;
}

/** Renders one message in _User_Message_Format_: the header line, the main text, then attached YAML fields after `--`. */
export function formatMessage(message: UserMessage): string {
  const { number, kind, target, text, ...attached } = messageFields(message);
  const header = `[adoc message ${number}] ${kind}${target ? ` · ${target}` : ''}`;
  const body = typeof text === 'string' && text ? `${text.replace(/\s+$/, '')}\n` : '';
  const attachments = Object.keys(attached).length ? `--\n${stringify(attached, { lineWidth: 0, blockQuote: 'literal' })}` : '';
  return `${header}\n${body}${attachments}`;
}

export function formatMessages(messages: readonly UserMessage[]): string {
  return messages.map(formatMessage).join('\n');
}

/**
 * Holds every _User_Message_ until it is delivered, in creation order.
 * Emits `change` whenever the held set changes.
 */
export class MessageQueue extends EventEmitter {
  private next = 1;
  private held: UserMessage[] = [];
  private waiters: Array<() => void> = [];

  add(input: ({ kind: 'comment' } & CommentInput) | ({ kind: 'action' } & ActionMessageInput)): UserMessage {
    const message = { ...input, number: this.next++, createdAt: new Date().toISOString() } as UserMessage;
    this.held.push(message);
    this.emit('change');
    this.emit('added', message);
    for (const wake of this.waiters.splice(0)) wake();
    return message;
  }

  list(): UserMessage[] {
    return [...this.held];
  }

  /** Removes and returns every held message. */
  takeAll(): UserMessage[] {
    const taken = this.held;
    this.held = [];
    if (taken.length) this.emit('change');
    return taken;
  }

  /** Removes the given messages after a push transport delivered them. */
  markDelivered(numbers: readonly number[]): void {
    const before = this.held.length;
    this.held = this.held.filter((m) => !numbers.includes(m.number));
    if (this.held.length !== before) this.emit('change');
  }

  /** Waits until at least one message is held, then takes all of them; resolves with [] after `timeoutMs`. */
  async wait(timeoutMs?: number, signal?: AbortSignal): Promise<UserMessage[]> {
    if (this.held.length) return this.takeAll();
    return new Promise((resolve) => {
      let timer: NodeJS.Timeout | undefined;
      const finish = () => {
        clearTimeout(timer);
        this.waiters = this.waiters.filter((w) => w !== wake);
        signal?.removeEventListener('abort', abort);
      };
      const wake = () => {
        finish();
        resolve(this.takeAll());
      };
      const abort = () => {
        finish();
        resolve([]);
      };
      this.waiters.push(wake);
      signal?.addEventListener('abort', abort);
      if (timeoutMs !== undefined) timer = setTimeout(abort, timeoutMs);
    });
  }
}
