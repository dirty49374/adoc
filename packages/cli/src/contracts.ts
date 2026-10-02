export type OutputFormat = 'text' | 'markdown' | 'json' | 'yaml';

export interface Streams {
  stdout(text: string): void;
  stderr(text: string): void;
}

/** What every command receives besides its arguments. */
export interface CommandContext {
  readonly cwd: string;
  readonly env: NodeJS.ProcessEnv;
  readonly streams: Streams;
  /** True when the command runs through the _Adoc_MCP_Tool_. */
  readonly mcp: boolean;
  /** Reads what the command would read from standard input. */
  stdin(): Promise<string>;
}

/** A finite command result: structured data for json/yaml, text for text/markdown. */
export interface CommandResult {
  data: unknown;
  text: string;
  markdown?: string;
  exitCode?: number;
}

export type OptionSpec = readonly [flags: string, description: string];

/** One `adoc <noun> <verb>` command. */
export interface CommandDefinition {
  readonly name: string;
  readonly argument?: string;
  readonly options: readonly OptionSpec[];
  readonly summary: string;
  readonly behavior: string;
  readonly example: string;
  /** Refused through MCP: process and installation commands. */
  readonly localOnly?: boolean;
  /** Returns a result, or nothing for a long-running command that has finished. */
  run(args: string[], options: Record<string, unknown> & { home?: string }, context: CommandContext): Promise<CommandResult | void>;
}
