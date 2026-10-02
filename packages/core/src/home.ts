import { stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { AdocError } from './errors.js';

export const HOME_DIRECTORY = '.adoc';
export const HOME_VARIABLE = 'ADOC_HOME';
export const CONFIG_FILE = 'adoc.yaml';

/** A selected _Adoc_Home_ and the _Adoc_Workspace_ that holds it. */
export interface AdocHome {
  readonly home: string;
  readonly workspace: string;
  readonly configPath: string;
  readonly origin: 'option' | 'environment' | 'ancestor';
}

async function isDirectory(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isDirectory();
  } catch {
    return false;
  }
}

function select(path: string, origin: AdocHome['origin'], cwd: string): AdocHome {
  const home = resolve(cwd, path);
  return { home, workspace: dirname(home), configPath: join(home, CONFIG_FILE), origin };
}

/** Selects the _Adoc_Home_: `--home`, then `ADOC_HOME`, then the nearest `.adoc` from `cwd` upward. */
export async function discoverHome(cwd: string, explicit?: string, env: NodeJS.ProcessEnv = process.env): Promise<AdocHome> {
  if (explicit !== undefined) {
    const selected = select(explicit, 'option', cwd);
    if (!(await isDirectory(selected.home))) throw new AdocError('home.missing', `--home ${explicit} is not a directory.`);
    return selected;
  }
  const variable = env[HOME_VARIABLE];
  if (variable !== undefined && variable.trim() !== '') {
    const selected = select(variable, 'environment', cwd);
    if (!(await isDirectory(selected.home))) throw new AdocError('home.missing', `${HOME_VARIABLE}=${variable} is not a directory.`);
    return selected;
  }
  for (let directory = resolve(cwd); ; directory = dirname(directory)) {
    const candidate = join(directory, HOME_DIRECTORY);
    if (await isDirectory(candidate)) return select(candidate, 'ancestor', cwd);
    if (dirname(directory) === directory) break;
  }
  throw new AdocError('home.missing', `No ${HOME_DIRECTORY} directory from ${cwd} upward; run adoc init.`);
}
