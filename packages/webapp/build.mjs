import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

// Bundles the web UI into dist/, which @adoc/core serves.
const out = new URL('./dist/', import.meta.url).pathname;
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL('./public/', import.meta.url).pathname, out, { recursive: true });
await build({
  entryPoints: [new URL('./src/main.tsx', import.meta.url).pathname],
  outfile: `${out}app.js`,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  minify: true,
  sourcemap: true,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
