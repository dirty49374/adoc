import { cp, mkdir, readFile, readdir, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

// Collects the licenses of the third-party packages that a bundle carries, as aterm does: the esbuild inputs (and any
// file copied from a package) name the packages actually shipped, transitive imports included.

const KEPT = new URL('./licenses/', import.meta.url).pathname;
const LICENSE_FILE = /^(licen[cs]e|notice|copying|copyright)([._-]|$)/i;

/** The package that holds a file: the nearest package.json above it with a name and a version. */
async function owner(file) {
  let directory = dirname(await realpath(file));
  while (dirname(directory) !== directory) {
    try {
      const manifest = JSON.parse(await readFile(join(directory, 'package.json'), 'utf8'));
      if (manifest.name && manifest.version) return { directory, manifest };
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
    directory = dirname(directory);
  }
  return undefined;
}

/**
 * Writes `destination/` with one folder per bundled package holding its LICENSE, COPYING, COPYRIGHT and NOTICE files,
 * and `packages.json`, the inventory. `inputs` are file paths; only those inside node_modules count.
 */
export async function writeLicenses(inputs, destination) {
  const packages = new Map();
  for (const input of inputs) {
    if (!input.includes('node_modules/')) continue;
    const found = await owner(input);
    if (!found) throw new Error(`No package metadata for bundled dependency: ${input}`);
    const identity = `${found.manifest.name}@${found.manifest.version}`;
    const entry = packages.get(identity) ?? { ...found, extra: new Set() };
    // A license file given as an input counts for its package, for packages that keep it below the top, such as pretendard.
    if (LICENSE_FILE.test(input.split('/').pop())) entry.extra.add(input);
    packages.set(identity, entry);
  }
  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });
  const inventory = [];
  const missing = [];
  for (const [identity, { directory, manifest, extra }] of [...packages].sort(([a], [b]) => a.localeCompare(b, 'en'))) {
    const top = (await readdir(directory, { withFileTypes: true })).filter((file) => file.isFile() && LICENSE_FILE.test(file.name)).map((file) => join(directory, file.name));
    const folder = identity.replaceAll('/', '__');
    // A package published without its license file gets the upstream text kept in tooling/licenses/<name>@<version>/, <name>/
    // or, for a scope whose packages share one license, <@scope>/.
    const kept = [];
    for (const name of [folder, manifest.name.replaceAll('/', '__'), ...(manifest.name.startsWith('@') ? [manifest.name.split('/')[0]] : [])]) {
      try {
        kept.push(...(await readdir(join(KEPT, name))).map((file) => join(KEPT, name, file)));
        break;
      } catch {
        // none kept under this name
      }
    }
    const paths = [...new Set([...top, ...extra, ...kept])].sort();
    const files = paths.map((path) => path.split('/').pop());
    if (!files.some((file) => /^(licen[cs]e|copying)([._-]|$)/i.test(file))) {
      missing.push(`${identity} (${manifest.license ?? 'no license field'}, ${typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url ?? 'no repository'})`);
      continue;
    }
    await mkdir(join(destination, folder), { recursive: true });
    for (const path of paths) await cp(path, join(destination, folder, path.split('/').pop()));
    inventory.push({ name: manifest.name, version: manifest.version, license: manifest.license ?? 'See the included license file', repository: manifest.repository, files: files.map((file) => `${folder}/${file}`) });
  }
  if (missing.length) throw new Error(`Bundled packages without a license file; keep the upstream text in tooling/licenses/<name>/:\n${missing.join('\n')}`);
  await writeFile(join(destination, 'packages.json'), `${JSON.stringify(inventory, null, 2)}\n`);
  return inventory;
}

/** The input files of an esbuild metafile, as absolute paths. */
export function metafileInputs(metafile, cwd = process.cwd()) {
  return Object.keys(metafile.inputs).map((input) => (input.startsWith('/') ? input : join(cwd, input)));
}
