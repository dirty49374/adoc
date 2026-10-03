import { cp } from 'node:fs/promises';

// Run as `prepack` in each published package: copies the repository's LICENSE and THIRD_PARTY_NOTICES.md next to its
// package.json, so that every package carries both (the copies are ignored by git).
for (const file of ['LICENSE', 'THIRD_PARTY_NOTICES.md']) await cp(new URL(`../${file}`, import.meta.url), `${process.cwd()}/${file}`);
