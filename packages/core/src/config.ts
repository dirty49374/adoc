import { readFile } from 'node:fs/promises';
import { parse } from 'yaml';
import { z } from 'zod';
import { AdocError } from './errors.js';
import type { AdocHome } from './home.js';
import { PLUGIN_KEY_PATTERN } from './names.js';

const transportSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('herdr') }),
  z.object({ kind: z.literal('hc'), target: z.string().min(1) }),
  z.object({ kind: z.literal('wait') }),
]);

export const configSchema = z.object({
  plugins: z
    .array(
      z.object({
        key: z.string().regex(PLUGIN_KEY_PATTERN, 'a plugin key must be uppercase letters A-Z only'),
        from: z.string().min(1),
      }),
    )
    .default([]),
  watch: z.array(z.string().min(1)).default(['docs']),
  agent: z
    .object({
      name: z.string().min(1).default('agent'),
      transport: transportSchema.default({ kind: 'herdr' }),
    })
    .default({ name: 'agent', transport: { kind: 'herdr' } }),
  server: z
    .object({
      host: z.string().default('127.0.0.1'),
      port: z.number().int().min(1).max(65535).default(7700),
    })
    .default({ host: '127.0.0.1', port: 7700 }),
  ui: z
    .object({
      theme: z.enum(['dark', 'light', 'system']).default('dark'),
    })
    .default({ theme: 'dark' }),
});

/** The parsed _Adoc_Config_. */
export type AdocConfig = z.infer<typeof configSchema>;
export type TransportConfig = AdocConfig['agent']['transport'];

export async function readConfig(home: AdocHome): Promise<AdocConfig> {
  let text: string;
  try {
    text = await readFile(home.configPath, 'utf8');
  } catch {
    throw new AdocError('config.missing', `Cannot read ${home.configPath}; run adoc init.`);
  }
  const result = configSchema.safeParse(parse(text) ?? {});
  if (!result.success) {
    const details = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ');
    throw new AdocError('config.invalid', `${home.configPath}: ${details}`);
  }
  const keys = result.data.plugins.map((p) => p.key);
  const duplicate = keys.find((k, i) => keys.indexOf(k) !== i);
  if (duplicate) throw new AdocError('config.invalid', `${home.configPath}: plugin key ${duplicate} is declared twice.`);
  return result.data;
}

export const CONFIG_TEMPLATE = `# adoc workspace configuration. Paths are relative to the workspace root.
plugins: []
#  - key: TODO
#    from: ./plugins/todo        # a local folder with index.ts, or an npm package name
watch:
  - docs
agent:
  name: agent
  transport:
    kind: herdr                 # herdr (the pane from adoc agent claim) | hc (target: <hc address>) | wait
server:
  host: 127.0.0.1               # 0.0.0.0 to accept connections from the internal network
  port: 7700
ui:
  theme: dark                   # default colour scheme of the web UI: dark | light | system; each browser may choose another
`;
