import { cp, readFile, writeFile } from 'node:fs/promises';

// Run as `prepack` in each published package: copies the repository's LICENSE and THIRD_PARTY_NOTICES.md next to its
// package.json, so that every package carries both (the copies are ignored by git). With `--readme`, it also copies
// README.md, with its relative links made absolute, since npm shows a package's README outside the repository.
const REPOSITORY = 'https://github.com/garage49/adoc';

for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await cp(new URL(`../${file}`, import.meta.url), `${process.cwd()}/${file}`);
if (process.argv.includes('--readme')) {
  const text = await readFile(new URL('../README.md', import.meta.url), 'utf8');
  const absolute = text
    .replace(/!\[([^\]]*)\]\((?!https?:)([^)]+)\)/g, `![$1](${REPOSITORY.replace('github.com', 'raw.githubusercontent.com')}/HEAD/$2)`)
    .replace(/(^|[^!])\[([^\]]*)\]\((?!https?:|#)([^)]+)\)/g, `$1[$2](${REPOSITORY}/blob/HEAD/$3)`);
  await writeFile(`${process.cwd()}/README.md`, absolute);
}
