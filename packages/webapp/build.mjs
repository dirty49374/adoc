import { cp, mkdir, rm } from 'node:fs/promises';
import { build } from 'esbuild';

// Bundles the web UI into dist/, which @adoc/core serves: index.html for every client route, files under assets/.
const out = new URL('./dist/', import.meta.url).pathname;
await rm(out, { recursive: true, force: true });
await mkdir(out, { recursive: true });
await cp(new URL('./public/', import.meta.url).pathname, out, { recursive: true });
await cp(new URL('./node_modules/@xterm/xterm/css/xterm.css', import.meta.url).pathname, `${out}assets/xterm.css`);
await cp(new URL('./node_modules/pretendard/dist/web/variable/woff2/PretendardVariable.woff2', import.meta.url).pathname, `${out}assets/fonts/PretendardVariable.woff2`);
await cp(new URL('./node_modules/pretendard/dist/LICENSE.txt', import.meta.url).pathname, `${out}assets/fonts/Pretendard-LICENSE.txt`);
await build({
  entryPoints: [new URL('./src/main.tsx', import.meta.url).pathname],
  outfile: `${out}assets/app.js`,
  bundle: true,
  platform: 'browser',
  format: 'esm',
  minify: true,
  sourcemap: true,
  jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  logLevel: 'warning',
});
