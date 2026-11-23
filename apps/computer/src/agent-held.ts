import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentHeldFrame } from '@haus/api';
import { retirableAgentId } from './agent-retirement.ts';

export async function sendAgentHeld(
    send: (frame: AgentHeldFrame) => unknown,
    dataRoot: string,
    serverId: string
) {
    send({ agentIds: await heldAgentIds(dataRoot, serverId), type: 'agent-held' });
}

export async function heldAgentIds(dataRoot: string, serverId: string) {
    const agentsRoot = join(dataRoot, 'servers', serverId, 'agents');
    const entries = await readdir(agentsRoot, { withFileTypes: true }).catch((error: unknown) => {
        if (isMissing(error)) {
            return [];
        }
        throw error;
    });
    return entries
        .filter((entry) => entry.isDirectory() && retirableAgentId.test(entry.name))
        .map((entry) => entry.name)
        .sort();
}

function isMissing(error: unknown) {
    return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
