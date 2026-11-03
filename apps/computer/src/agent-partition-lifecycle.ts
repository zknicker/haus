import { join } from 'node:path';
import { parseRestartCommand } from './agent-command-frames.ts';
import { disposeAgentLaunchHost } from './agent-launch-host.ts';
import { resetAgentState } from './agent-reset.ts';
import { purgeRetiredAgent, reportRetirementError } from './agent-retirement.ts';
import type { AgentWorkCoordinator } from './agent-work-coordinator.ts';
import type { DaemonRuntime } from './daemon-runtime.ts';
import { harnessSessionOwner } from './harness/session-lifecycle.ts';
import { requestSessionRestart } from './harness/session-restart.ts';
import { evictWarmRuntime } from './runtime/runtime-context.ts';
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

/** A stuck purge is logged against the Agent; the Server's retirement tombstone replays it. */
export async function retireOwnedAgentState(input: Location) {
    try {
        await stopOwnedSession(input);
        await purgeRetiredAgent(input);
    } catch (error) {
        reportRetirementError(input.agentId, error);
    }
}

/**
 * A Server `agent-restart`: once the Agent's queued configuration and live run are done, its
 * session restarts (see {@link restartOwnedSession}). Returns whether `frame` was one.
 */
export function handleRestartFrame(
    frame: unknown,
    deps: Omit<Location, 'agentId'> & {
        agentWork: Pick<AgentWorkCoordinator, 'enqueueConfiguration' | 'waitForRun'>;
        onError(error: unknown): void;
        retiredAgents: ReadonlySet<string>;
        track<Result>(operation: Promise<Result>): Promise<Result>;
    }
): boolean {
    const restart = parseRestartCommand(frame);
    if (!restart) {
        return false;
    }
    const { agentId } = restart;
    if (deps.retiredAgents.has(agentId)) {
        return true;
    }
    void deps
        .track(
            deps.agentWork.enqueueConfiguration(agentId, async () => {
                await deps.agentWork.waitForRun(agentId);
                await restartOwnedSession({ ...deps, agentId });
            })
        )
        .catch(deps.onError);
    return true;
}

/**
 * Restart refreshes instructions while keeping the conversation: the parked process ends (its
 * background work with it, on purpose and unreported, as Stop does), so the next turn resumes
 * on a new process with a new loopback proxy instead of the old process calling a dead one.
 */
export async function restartOwnedSession(input: Location) {
    await stopOwnedSession(input);
    await requestSessionRestart(
        join(input.dataRoot, 'servers', input.serverId, 'agents', input.agentId)
    );
}

export function agentWorkspacePreparation(dataRoot: string, runtimeId: string | null) {
    return runtimeId === 'fake'
        ? undefined
        : (agentRoot: string) => ensureAgentWorkspace({ agentRoot, dataRoot });
}

async function stopOwnedSession(input: Location) {
    const root = join(input.dataRoot, 'servers', input.serverId, 'agents', input.agentId);
    await harnessSessionOwner(input.runtime).stopAgent(root);
    await evictWarmRuntime(input.runtime, root);
    disposeAgentLaunchHost(input.serverId, input.agentId);
}
