#!/usr/bin/env node
// One version line for the whole repository (garage49 build rules): the root package.json's version is the version of
// every package, of adoc-hub (ranch-plugin/Cargo.toml and herdr-plugin.toml), and of the release tag vX.Y.Z, and the kit
// range adoc's plugins accept follows it. Run by `pnpm check`; fails naming every file that disagrees.
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = new URL('..', import.meta.url).pathname;
const version = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
const files = [
  ...['packages', 'plugins'].flatMap((dir) => readdirSync(join(root, dir), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => join(dir, e.name, 'package.json'))),
  'ranch-plugin/Cargo.toml',
  'ranch-plugin/herdr-plugin.toml',
];
const wrong = [];
for (const file of files) {
  const text = readFileSync(join(root, file), 'utf8');
  const found = file.endsWith('.json') ? JSON.parse(text).version : /^version = "([^"]+)"/m.exec(text)?.[1];
  if (found !== version) wrong.push(`${file}: ${found ?? 'no version'}`);
}
// adoc's own plugins must accept the kit they ship with: their peerDependencies range is ^<major>.<minor>.0 of this version
const [major, minor] = version.split('.');
for (const name of readdirSync(join(root, 'plugins'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name)) {
  const range = JSON.parse(readFileSync(join(root, 'plugins', name, 'package.json'), 'utf8')).peerDependencies?.['@garage49/adoc-plugin-kit'];
  if (range !== `^${major}.${minor}.0`) wrong.push(`plugins/${name}/package.json: peerDependencies @garage49/adoc-plugin-kit ${range ?? 'missing'}, want ^${major}.${minor}.0`);
}
if (wrong.length) {
  console.error(`versions differ from package.json ${version}:\n  ${wrong.join('\n  ')}`);
  process.exit(1);
}
