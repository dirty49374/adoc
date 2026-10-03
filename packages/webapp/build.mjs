import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';
import { metafileInputs, writeLicenses } from '../../tooling/licenses.mjs';

// Bundles the web UI into dist/, which @agent-workshop/adoc-core serves: index.html for every client route, files under assets/.
const out = new URL('./dist/', import.meta.url).pathname;
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL('./public/', import.meta.url).pathname, out, { recursive: true });
await cp(new URL('./node_modules/@xterm/xterm/css/xterm.css', import.meta.url).pathname, `${out}assets/xterm.css`);
await cp(new URL('./node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2', import.meta.url).pathname, `${out}assets/fonts/PretendardVariable.woff2`);
await cp(new URL('./node_modules/pretendard/dist/LICENSE.txt', import.meta.url).pathname, `${out}assets/fonts/Pretendard-LICENSE.txt`);
const result = await build({
  entryPoints: [new URL('./src/main.tsx', import.meta.url).pathname],
  outdir: `${out}assets/`,
  entryNames: 'app',
  // Large libraries that only some pages need, such as Mermaid, load on demand from their own chunks.
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true,
  platform: 'browser',
  format: 'esm',
  minify: true,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  metafile: true,
  logLevel: 'warning',
});
// The licenses of every package in the bundle and of the files copied above from packages.
const copied = ['./node_modules/@xterm/xterm/css/xterm.css', './node_modules/pretendard/dist/LICENSE.txt'].map((path) => new URL(path, import.meta.url).pathname);
await writeLicenses([...metafileInputs(result.metafile), ...copied], `${out}licenses`);
