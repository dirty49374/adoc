import { Command, CommanderError, Option } from 'commander';
import { stringify } from 'yaml';
import { AdocError, errorMessage } from '@adoc/core';
import { commands, groups, skillWarnings } from './commands.js';
import type { CommandContext, CommandDefinition, CommandResult, OutputFormat } from './contracts.js';
import { VERSION } from './version.js';

function render(result: CommandResult, format: OutputFormat): string {
  switch (format) {
    case 'json':
      return JSON.stringify(result.data, null, 2);
    case 'yaml':
      return stringify(result.data, { lineWidth: 0 }).trimEnd();
    case 'markdown':
      return result.markdown ?? result.text;
    case 'text':
      return result.text;
  }
}

/** Builds the `adoc` command line. `exitCode` receives the status of the command that ran. */
export function buildProgram(context: CommandContext, exitCode: (code: number) => void): Command {
  const program = new Command('adoc')
    .description('adoc: plugin-defined documents kept in git, edited by an agent, commented on from a web UI.')
    .version(VERSION)
    .option('--home <path>', 'the .adoc directory to use (default: ADOC_HOME, then the nearest .adoc upward)')
    .addOption(new Option('--output <format>', 'result format').choices(['text', 'markdown', 'json', 'yaml']).default('text'))
    .showHelpAfterError()
    .allowExcessArguments(false);

  const execute = async (definition: CommandDefinition, args: string[], options: Record<string, unknown>) => {
    try {
      if (context.mcp && (definition.localOnly || options.home !== undefined)) {
        throw new AdocError('command.mcp', `adoc ${definition.name} and --home are local-only; run them from a terminal. MCP uses the workspace it was started in.`);
      }
      const result = await definition.run(args, options as Record<string, unknown> & { home?: string }, context);
      if (result) {
        const text = render(result, (options.output as OutputFormat) ?? 'text');
        if (text) context.streams.stdout(text.endsWith('\n') ? text : text + '\n');
        exitCode(result.exitCode ?? 0);
      } else {
        exitCode(0);
      }
    } catch (error) {
      context.streams.stderr(`adoc: ${errorMessage(error)}\n`);
      exitCode(1);
    }
    // _Skill_Check_ after every command, also through MCP (whose result carries stderr).
    for (const warning of await skillWarnings(options, context)) context.streams.stderr(`adoc: warning: ${warning}\n`);
  };

  for (const definition of commands) {
    const parts = definition.name.split(' ');
    const leaf = parts.pop()!;
    let parent = program;
    for (const part of parts) {
      let group = parent.commands.find((c) => c.name() === part);
      if (!group) {
        const description = groups[part];
        if (!description) throw new Error(`no group description for ${part}`);
        group = parent.command(part).description(description).allowExcessArguments(false);
        const created = group;
        created.action(() => created.outputHelp());
      }
      parent = group;
    }
    const command = parent.command(leaf + (definition.argument ? ` ${definition.argument}` : '')).description(definition.summary).allowExcessArguments(false);
    for (const [flags, description] of definition.options) command.option(flags, description);
    command.addHelpText('after', `\nBehavior: ${definition.behavior}\n\nExample:\n  ${definition.example}\n`);
    command.action(async (...received: unknown[]) => {
      const current = received.at(-1) as Command;
      const args = received.slice(0, -2).filter((a): a is string => typeof a === 'string');
      await execute(definition, args, current.optsWithGlobals());
    });
  }
  return program;
}

/** Runs one command line with the given context and returns its exit status. */
export async function runCommand(argv: readonly string[], context: CommandContext): Promise<number> {
  let status = 0;
  const program = buildProgram(context, (code) => {
    status = code;
  });
  const configure = (command: Command) => {
    command.exitOverride().configureOutput({ writeOut: (t) => context.streams.stdout(t), writeErr: (t) => context.streams.stderr(t) });
    command.commands.forEach(configure);
  };
  configure(program);
  try {
    await program.parseAsync([...argv], { from: 'user' });
  } catch (error) {
    if (error instanceof CommanderError) return error.code === 'commander.helpDisplayed' || error.code === 'commander.version' || error.exitCode === 0 ? 0 : 1;
    throw error;
  }
  return status;
}
