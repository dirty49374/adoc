import type { AdocConfig } from './config.js';
import { AdocError, errorMessage } from './errors.js';
import { readServerRecord } from './registry.js';
import { PROTOCOL } from './server.js';

/** Talks to the running _Adoc_Server_ of a workspace from the command line. */
export class ServerClient {
  private constructor(
    readonly url: string,
    private readonly workspace: string,
  ) {}

  /** Finds the server through its _Server_Record_, falling back to the address in adoc.yaml. */
  static async find(config: AdocConfig, workspace: string): Promise<ServerClient> {
    const record = await readServerRecord(workspace);
    if (record) return new ServerClient(record.url, workspace);
    const host = config.server.host === '0.0.0.0' || config.server.host === '::' ? '127.0.0.1' : config.server.host;
    return new ServerClient(`http://${host}:${config.server.port}`, workspace);
  }

  /** Fails with a clear error unless the server of this workspace answers. */
  async ensure(): Promise<void> {
    let health: { protocol?: string; workspace?: string };
    try {
      const response = await fetch(`${this.url}/api/health`, { signal: AbortSignal.timeout(2000) });
      health = (await response.json()) as typeof health;
    } catch (error) {
      throw new AdocError('server.unreachable', `No adoc server answers at ${this.url} (${errorMessage(error)}); start it with adoc server run.`);
    }
    if (health.protocol !== PROTOCOL) throw new AdocError('server.protocol', `${this.url} is not an adoc server.`);
    if (health.workspace !== this.workspace) throw new AdocError('server.workspace', `The adoc server at ${this.url} serves ${health.workspace}, not ${this.workspace}.`);
  }

  async get<T>(path: string): Promise<T> {
    return this.request<T>(path, {});
  }

  async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const response = await fetch(this.url + path, init);
    const body = (await response.json()) as T & { error?: string };
    if (!response.ok) throw new AdocError('server.request', body.error ?? `${path} failed with ${response.status}`);
    return body;
  }
}
