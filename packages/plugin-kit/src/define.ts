import { z } from 'zod';
import type { PluginDefinition } from './types.js';
import { HtmlFragment } from './types.js';

const fn = z.custom<(...args: never[]) => unknown>((v) => typeof v === 'function', 'must be a function');

const EXTENSION = /^\.[a-z0-9]+$/;

const layoutSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('file'),
    extension: z.string().regex(EXTENSION, 'must look like ".md" (a dot, then lowercase letters or digits)'),
    companions: z.array(z.string().regex(EXTENSION, 'each must look like ".png" (a dot, then lowercase letters or digits)')).optional(),
  }),
  z.object({ kind: z.literal('folder'), entry: z.string().regex(/^[^/\\]+$/, 'must be a file name inside the folder, such as "bug.yaml"') }),
]);

/** Action names the web UI's document header sends for every document; the agent handles them, never a plugin. */
const RESERVED_ACTIONS = ['archive', 'unarchive'];

const definitionSchema = z.object({
  description: z.string().min(1, 'must be a non-empty one-line description'),
  layout: layoutSchema,
  summarize: fn,
  render: fn,
  renderChanges: fn.optional(),
  actions: z
    .record(z.string().regex(/^[a-z][a-z0-9-]*$/, 'action names must be lowercase words such as "toggle"'), fn)
    .superRefine((actions, context) => {
      for (const name of RESERVED_ACTIONS.filter((reserved) => reserved in actions)) {
        context.addIssue({ code: 'custom', path: [name], message: 'archive and unarchive are sent by the document header for the agent; choose another name' });
      }
    })
    .optional(),
});

/** Validates what `summarize` returned. */
export const summarySchema = z.object({
  title: z.string(),
  status: z.string(),
  fields: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).optional(),
});

/** A file content in an action result: text, or binary data as base64. */
const contentSchema = z.union([z.string(), z.object({ base64: z.string() }).strict()]);

/** Validates what an action handler returned. */
export const actionResultSchema = z
  .object({
    text: z.string().optional(),
    files: z.record(z.string(), contentSchema).optional(),
    companions: z.record(z.string(), contentSchema).optional(),
    message: z.string().optional(),
  })
  .strict();

/** Validates what `render` returned. */
export const renderResultSchema = z.union([z.string(), z.instanceof(HtmlFragment)], {
  error: 'must return a string or the result of html`…`',
});

/** Turns a zod error into one line per problem: `field.path: message`. */
export function describeIssues(error: z.ZodError, prefix: string): string {
  return error.issues.map((issue) => `${[prefix, ...issue.path.map(String)].filter(Boolean).join('.')}: ${issue.message}`).join('; ');
}

/**
 * Declares a plugin. Default-export its result from the plugin's `index.ts`.
 * Throws a one-line error naming each wrong field, so mistakes show up when adoc loads the plugin.
 */
export function definePlugin(definition: PluginDefinition): PluginDefinition {
  const result = definitionSchema.safeParse(definition);
  if (!result.success) throw new Error(`definePlugin: ${describeIssues(result.error, '')}`);
  return definition;
}
