import { join } from 'node:path';
import { disposeAgentLaunchHost } from './agent-launch-host.ts';
import { resetAgentState } from './agent-reset.ts';
import { purgeRetiredAgent } from './agent-retirement.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { harnessSessionOwner } from './harness/session-lifecycle.ts';
import { ensureAgentWorkspace } from './workspace-volumes/workspace-volume.ts';

interface Location {
    agentId: string;
    dataRoot: string;
    runtime: DaemonRuntime;
    serverId: string;
}

export async function resetOwnedAgentState(input: Location & { kind: 'full' | 'session' }) {
    await stopOwnedSession(input);
    await resetAgentState(input);
}

export async function retireOwnedAgentState(input: Location) {
    await stopOwnedSession(input);
    await purgeRetiredAgent(input);
}

export function agentWorkspacePreparation(dataRoot: string, runtimeId: string | null) {
    return runtimeId === 'fake'
        ? undefined
        : (agentRoot: string) => ensureAgentWorkspace({ agentRoot, dataRoot });
}

async function stopOwnedSession(input: Location) {
    const root = join(input.dataRoot, 'servers', input.serverId, 'agents', input.agentId);
    await harnessSessionOwner(input.runtime).stopAgent(root);
    disposeAgentLaunchHost(input.serverId, input.agentId);
}
