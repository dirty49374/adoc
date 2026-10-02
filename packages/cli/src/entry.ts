#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { runCommand } from './program.js';

process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code === 'EPIPE') process.exit(process.exitCode ?? 0);
  throw error;
});

process.exitCode = await runCommand(process.argv.slice(2), {
  cwd: process.cwd(),
  env: process.env,
  mcp: false,
  streams: { stdout: (t) => process.stdout.write(t), stderr: (t) => process.stderr.write(t) },
  stdin: async () => readFileSync(0, 'utf8'),
});
