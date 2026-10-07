import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { parse } from 'yaml';
import { z } from 'zod';
import { AdocError } from './errors.js';
import type { AdocHome } from './home.js';
import { PLUGIN_KEY_PATTERN } from './names.js';

const transportSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('herdr') }),
  z.object({ kind: z.literal('wait') }),
]);

/** One config file, the _Adoc_Config_ or the _User_Config_: every setting is optional, since the two are laid over each other. */
const fileSchema = z.object({
  plugins: z.record(z.string().regex(PLUGIN_KEY_PATTERN, 'a plugin key must be uppercase letters A-Z only'), z.string().min(1)).optional(),
  watch: z.array(z.string().min(1)).optional(),
  agent: z.object({ name: z.string().min(1).optional(), transport: transportSchema.optional() }).optional(),
  server: z.object({ host: z.string().optional(), port: z.number().int().min(1).max(65535).optional() }).optional(),
  ui: z.object({ tabs: z.array(z.string()).optional(), theme: z.enum(['dark', 'light', 'system']).optional() }).optional(),
});

type ConfigFile = z.infer<typeof fileSchema>;

/** A _Plugin_ that the config declares: its key, its _Plugin_Source_ and the folder of the file that declares it. */
export interface DeclaredPlugin {
  readonly key: string;
  readonly source: string;
  /** Relative paths and npm lookups of the source start here. */
  readonly base: string;
}

/** The _Adoc_Config_ laid over the _User_Config_. */
export interface AdocConfig {
  /** In tab order: `ui.tabs` first, then the order of declaration. */
  readonly plugins: readonly DeclaredPlugin[];
  /** Relative to the workspace root. */
  readonly watch: readonly string[];
  readonly agent: { readonly name: string; readonly transport: TransportConfig };
  readonly server: { readonly host: string; readonly port: number };
  readonly ui: { readonly theme: 'dark' | 'light' | 'system' };
}
export type TransportConfig = z.infer<typeof transportSchema>;

/** The _User_Config_: `adoc/adoc.yaml` in the XDG config directory. */
export function userConfigPath(env: NodeJS.ProcessEnv = process.env): string {
  return join(env.XDG_CONFIG_HOME || join(env.HOME || homedir(), '.config'), 'adoc', 'adoc.yaml');
}

const FORMAT_HINT = 'plugins:\n  TODO: npm:@garage49/adoc-plugin-todo\n  TASK: ./plugins/task';

async function readFileConfig(path: string, required: boolean): Promise<ConfigFile> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch {
    if (required) throw new AdocError('config.missing', `Cannot read ${path}; run adoc init.`);
    return {};
  }
  let raw: unknown;
  try {
    raw = parse(text) ?? {};
  } catch (error) {
    throw new AdocError('config.invalid', `${path}: ${(error as Error).message}`);
  }
  if (Array.isArray((raw as { plugins?: unknown }).plugins)) {
    throw new AdocError('config.format', `${path}: plugins is a list in an earlier format; write it as a map from each plugin key to its source:\n${FORMAT_HINT}`);
  }
  const result = fileSchema.safeParse(raw);
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new AdocError('config.invalid', `${path}: ${details}`);
  }
  return result.data;
}

/** Reads the _User_Config_ and the _Adoc_Config_, and lays the second over the first, setting by setting. */
export async function readConfig(home: AdocHome, env: NodeJS.ProcessEnv = process.env): Promise<AdocConfig> {
  const userPath = userConfigPath(env);
  const user = await readFileConfig(userPath, false);
  const project = await readFileConfig(home.configPath, true);
  const layers = [
    { file: user, base: dirname(userPath) },
    { file: project, base: home.home },
  ];

  const declared = new Map<string, DeclaredPlugin>();
  // The project's own plugins come before the ones only the user declares.
  for (const { file, base } of [...layers].reverse()) {
    for (const [key, source] of Object.entries(file.plugins ?? {})) if (!declared.has(key)) declared.set(key, { key, source, base });
  }
  for (const [key, plugin] of declared) if (plugin.source === 'off') declared.delete(key);

  const last = <T>(pick: (file: ConfigFile) => T | undefined): { value: T; base: string } | undefined => {
    for (const { file, base } of [...layers].reverse()) {
      const value = pick(file);
      if (value !== undefined) return { value, base };
    }
    return undefined;
  };

  const tabs = last((f) => f.ui?.tabs)?.value ?? [];
  const ordered = [...tabs.filter((key) => declared.has(key)), ...[...declared.keys()].filter((key) => !tabs.includes(key))];
  const watch = last((f) => f.watch);
  return {
    plugins: ordered.map((key) => declared.get(key)!),
    watch: watch ? watch.value.map((path) => relative(home.workspace, resolve(watch.base, path)) || '.') : ['docs'],
    agent: { name: last((f) => f.agent?.name)?.value ?? 'agent', transport: last((f) => f.agent?.transport)?.value ?? { kind: 'herdr' } },
    server: { host: last((f) => f.server?.host)?.value ?? '127.0.0.1', port: last((f) => f.server?.port)?.value ?? 7700 },
    ui: { theme: last((f) => f.ui?.theme)?.value ?? 'dark' },
  };
}

export const CONFIG_TEMPLATE = `# adoc workspace configuration, laid over ~/.config/adoc/adoc.yaml. Paths are relative to this file.
plugins:                        # plugin key: npm:<package>, github:<owner>/<repo>/<folder>, a path such as ./plugins/x, or off
  NOTE: npm:@garage49/adoc-plugin-note
  TODO: npm:@garage49/adoc-plugin-todo
  SKETCH: npm:@garage49/adoc-plugin-sketch
  TASK: npm:@garage49/adoc-plugin-task
  KANBAN: npm:@garage49/adoc-plugin-kanban
watch:
  - ../docs
agent:
  name: agent
  transport:
    kind: herdr                 # herdr (the pane from adoc agent claim) | wait (the agent runs adoc message wait)
server:
  host: 127.0.0.1               # 0.0.0.0 to accept connections from the internal network (no authentication)
  port: 7700
ui:
  tabs: [NOTE, TODO, SKETCH, TASK, KANBAN]
  theme: dark                   # default colour scheme of the web UI: dark | light | system; each browser may choose another
`;
