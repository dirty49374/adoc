import type { IncomingMessage, ServerResponse } from 'node:http';
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { CallToolRequestSchema, ListToolsRequestSchema, type Tool } from '@modelcontextprotocol/sdk/types.js';
import { parse } from 'shell-quote';
import { z } from 'zod';
import { AdocError, errorMessage, type ServerExtension } from '@garage49/adoc-core';
import type { CommandContext } from './contracts.js';
import { commands } from './commands.js';
import { runCommand } from './program.js';
import { VERSION } from './version.js';

const toolInput = z.object({ cmd: z.string().min(1), stdin: z.string().optional() });

/** The tool, described from the command definitions so that its list of commands always matches the CLI. */
function tool(): Tool {
  const names = commands.filter((command) => !command.localOnly).map((command) => command.name);
  return {
    name: 'adoc',
    description:
      'Run one adoc CLI command without the leading "adoc", for example {"cmd": "message wait --timeout 600"} or {"cmd": "skill view adoc-todo"}. ' +
      `Commands: ${names.join(', ')}. The other commands and --home work only on the command line. Use stdin for text the command reads from standard input.`,
    inputSchema: z.toJSONSchema(toolInput) as Tool['inputSchema'],
  };
}

/** Splits `cmd` like a shell would, refusing operators, globs and comments. */
export function commandArguments(cmd: string): string[] {
  if (!cmd.trim()) throw new AdocError('command.empty', 'Supply one adoc command, without the executable prefix.');
  const words = parse(cmd, (name) => '$' + name);
  if (words.some((word) => typeof word !== 'string')) throw new AdocError('command.syntax', 'Supply one command; quote shell operators, globs and # characters.');
  return words as string[];
}

/** Runs a command through the same code as the terminal and captures its output. */
export async function runCaptured(cmd: string, stdin: string | undefined, base: Pick<CommandContext, 'cwd' | 'env'>) {
  let stdout = '';
  let stderr = '';
  const context: CommandContext = {
    cwd: base.cwd,
    env: base.env,
    mcp: true,
    streams: { stdout: (t) => (stdout += t), stderr: (t) => (stderr += t) },
    stdin: async () => stdin ?? '',
  };
  let exitCode: number;
  try {
    exitCode = await runCommand(commandArguments(cmd), context);
  } catch (error) {
    stderr += `adoc: ${errorMessage(error)}\n`;
    exitCode = 1;
  }
  return { stdout, stderr, exitCode };
}

function createConnection(base: Pick<CommandContext, 'cwd' | 'env'>): Server {
  const server = new Server({ name: 'adoc', version: VERSION }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools: [tool()] }));
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    if (request.params.name !== 'adoc') return { content: [{ type: 'text', text: `unknown tool ${request.params.name}` }], isError: true };
    const input = toolInput.safeParse(request.params.arguments ?? {});
    if (!input.success) return { content: [{ type: 'text', text: 'adoc needs {"cmd": "<command without adoc>"}' }], isError: true };
    const result = await runCaptured(input.data.cmd, input.data.stdin, base);
    const text = result.stdout + (result.stderr ? `${result.stdout ? '\n' : ''}[stderr]\n${result.stderr}` : '');
    return { content: [{ type: 'text', text: text || '(no output)' }], structuredContent: { ...result }, isError: result.exitCode !== 0 };
  });
  return server;
}

/** Serves the _Adoc_MCP_Tool_ over stdio until the client closes. */
export async function serveStdio(context: CommandContext): Promise<void> {
  const server = createConnection(context);
  const transport = new StdioServerTransport();
  const closed = new Promise<void>((done) => {
    transport.onclose = () => done();
    process.stdin.once('end', () => done());
  });
  await server.connect(transport);
  await closed;
  await server.close().catch(() => undefined);
}

/** The `/mcp` route of the _Adoc_Server_: stateless, one connection per request. */
export function createMcpEndpoint(context: Pick<CommandContext, 'cwd' | 'env'>): ServerExtension {
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.url?.split('?')[0] !== '/mcp') return false;
    const server = createConnection(context);
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    response.once('close', () => {
      void transport.close();
      void server.close();
    });
    await server.connect(transport);
    await transport.handleRequest(request, response);
    return true;
  };
}
