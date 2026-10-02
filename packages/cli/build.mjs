import { chmod } from 'node:fs/promises';

// tsc does not keep the executable bit of the entry point.
await chmod(new URL('./dist/entry.js', import.meta.url), 0o755);
