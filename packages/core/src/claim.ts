import { readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import type { AdocHome } from './home.js';
import type { ResolvedPane } from './herdr.js';

export const CLAIM_FILE = 'claim.yaml';

/** _Agent_Claim_: the herdr pane where the _Assigned_Agent_ runs, kept in `.adoc/claim.yaml`. */
export interface AgentClaim {
  herdrSession: string;
  socket: string;
  pane: string;
  terminal: string;
  agent?: string;
  agentSession?: string;
  claimedAt: string;
}

export function claimPath(home: AdocHome): string {
  return join(home.home, CLAIM_FILE);
}

export async function readClaim(home: AdocHome): Promise<AgentClaim | undefined> {
  try {
    const value = parse(await readFile(claimPath(home), 'utf8')) as AgentClaim | null;
    return value && typeof value.pane === 'string' && typeof value.socket === 'string' ? value : undefined;
  } catch {
    return undefined;
  }
}

export async function writeClaim(home: AdocHome, resolved: ResolvedPane): Promise<AgentClaim> {
  const claim: AgentClaim = {
    herdrSession: resolved.herdrSession,
    socket: resolved.socket,
    pane: resolved.pane.pane_id,
    terminal: resolved.pane.terminal_id,
    claimedAt: new Date().toISOString(),
  };
  if (resolved.pane.agent) claim.agent = resolved.pane.agent;
  if (resolved.pane.agent_session?.value) claim.agentSession = resolved.pane.agent_session.value;
  await writeFile(claimPath(home), `# The herdr pane of the assigned agent on this computer. Written by adoc agent claim; do not commit.\n${stringify(claim)}`);
  return claim;
}

export async function removeClaim(home: AdocHome): Promise<void> {
  await rm(claimPath(home), { force: true });
}
