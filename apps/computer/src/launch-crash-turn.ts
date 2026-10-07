import { appendFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentStartCommand, AgentTurnFrame } from './launch.ts';
import { messageOf } from './launch-trace.ts';
import { runtimeFailureFields } from './runtime-failure.ts';

/**
 * Produces the terminal frame required when launch fails before the runtime reports. The raw
 * error stays local (see `traceLaunchCrash`); only the kind, code, and its hash cross to the Server.
 */
export function launchCrashTurn(
    command: AgentStartCommand,
    startedAt: string,
    error: unknown
): AgentTurnFrame {
    return {
        activity: { operations: [] },
        agentId: command.agentId,
        endedAt: new Date().toISOString(),
        ...runtimeFailureFields(error, { code: 'launch-failed', kind: 'unknown' }),
        messageCount: 0,
        modelId: command.modelId,
        outputProduced: false,
        runId: command.runId,
        runtimeId: command.runtimeId,
        startedAt,
        status: 'failed',
        summary: 'The Agent launch failed before the runtime started.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}

/** Keeps the raw crash text in the Agent's Computer-local turn trace. Best effort. */
export async function traceLaunchCrash(
    location: { dataRoot: string; serverId: string },
    command: Pick<AgentStartCommand, 'agentId' | 'runId'>,
    error: unknown
): Promise<void> {
    const runtimeDir = join(
        location.dataRoot,
        'servers',
        location.serverId,
        'agents',
        command.agentId,
        'runtime'
    );
    await mkdir(runtimeDir, { mode: 0o700, recursive: true });
    await appendFile(
        join(runtimeDir, `turn-${command.runId}.log`),
        `Agent launch failed: ${messageOf(error)}\n`,
        { mode: 0o600 }
    );
}

/** Builds the crash turn frame after tracing the raw error locally. */
export async function tracedCrashTurn(
    dataRoot: string,
    attachment: { serverId: string },
    command: AgentStartCommand,
    startedAt: string,
    error: unknown
): Promise<AgentTurnFrame> {
    await traceLaunchCrash({ dataRoot, serverId: attachment.serverId }, command, error).catch(
        () => undefined
    );
    return launchCrashTurn(command, startedAt, error);
}
