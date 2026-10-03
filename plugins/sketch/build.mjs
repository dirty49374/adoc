import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

// Builds the plugin itself into dist/index.js, for the npm package (Node does not strip types under node_modules).
await build({
  entryPoints: [new URL('./index.ts', import.meta.url).pathname],
  outfile: new URL('./dist/index.js', import.meta.url).pathname,
  platform: 'node',
  format: 'esm',
  logLevel: 'warning',
});

// Bundles the board with Excalidraw and React into client/ (the plugin's client module): index.js and index.css, the
// chunks Excalidraw loads on demand, and its fonts.
const out = new URL('./client/', import.meta.url).pathname;
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await build({
  entryPoints: [new URL('./web/index.tsx', import.meta.url).pathname],
  entryNames: 'index',
  chunkNames: 'chunks/[name]-[hash]',
  assetNames: 'assets/[name]-[hash]',
  outdir: out,
  splitting: true,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  minify: true,
  jsx: 'automatic',
  conditions: ['production'],
  define: { 'process.env.NODE_ENV': '"production"', 'process.env.IS_PREACT': '"false"' },
  loader: { '.woff2': 'file', '.ttf': 'file', '.png': 'file', '.svg': 'file' },
  logLevel: 'warning',
});
await cp(new URL('./node_modules/@excalidraw/excalidraw/dist/prod/fonts/', import.meta.url).pathname, `${out}fonts/`, { recursive: true });
