import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { AgentInboxItem } from '../agent-inbox-item.ts';
import type { AgentTurnTimings } from '../agent-turn-timings.ts';
import { readMemoryIndex } from './memory-index.ts';
import type { AgentSessionState } from './session-store.ts';
import { buildWakeBriefing, seenInboxFileName } from './wake-briefing.ts';
import {
    decideWakeRecycle,
    describeWakeRecycle,
    isWakeRecycleOptedOut,
    readWakeRecycleConfig,
    recycledSession,
} from './wake-recycle.ts';

/**
 * EXPERIMENT (wake recycle, default off): the executor's two touch points. Every decision is
 * logged as a `[WakeRecycle]` line and stamped on the turn span as `haus.wake_recycle`.
 */
export async function planWakeRecycle(
    input: {
        agentId: string;
        agentRoot: string;
        inbox: AgentInboxItem[];
        runId: string;
        turnTimings?: AgentTurnTimings;
    },
    session: AgentSessionState
): Promise<{ recycled: boolean; session: AgentSessionState }> {
    const config = readWakeRecycleConfig();
    if (!config.enabled) {
        return { recycled: false, session };
    }
    await recordSeenInbox(input);
    const decision = decideWakeRecycle({
        config,
        now: Date.now(),
        optedOut: await isWakeRecycleOptedOut(input.agentRoot),
        session,
    });
    console.log(`${describeWakeRecycle(input.agentId, decision)} run=${input.runId}`);
    input.turnTimings?.setWakeRecycle(decision);
    return decision.recycle
        ? { recycled: true, session: recycledSession(session) }
        : { recycled: false, session };
}

/** The facts the next wake's recycle decision reads, recorded on every settled turn. */
export function settledTurnFacts(
    observation: { contextTokens: number | null },
    session: AgentSessionState
): Pick<AgentSessionState, 'lastContextTokens' | 'lastTurnEndedAt'> {
    return {
        lastContextTokens: observation.contextTokens ?? session.lastContextTokens ?? null,
        lastTurnEndedAt: new Date().toISOString(),
    };
}

/**
 * The memory-index and briefing that open a recycled session's first input, ahead of the normal
 * wake prompt. A copy lands in `runtime/wake-recycle-last-input.md` as bench evidence.
 */
export async function composeWakeRecycleContext(input: {
    agentId: string;
    agentRoot: string;
    inbox: AgentInboxItem[];
    runId: string;
    workspaceDir: string;
}): Promise<string[]> {
    const memoryIndex = await readMemoryIndex(input.workspaceDir);
    const briefing = await buildWakeBriefing({
        agentRoot: input.agentRoot,
        excludeMessageIds: new Set(input.inbox.map((item) => item.id)),
        excludeRunId: input.runId,
        workspaceDir: input.workspaceDir,
    }).catch((error: unknown) => {
        console.warn(`[WakeRecycle] agent=${input.agentId} briefing failed: ${String(error)}`);
        return null;
    });
    const context = [memoryIndex, briefing].filter((part): part is string => Boolean(part));
    const runtimeDir = join(input.agentRoot, 'runtime');
    await mkdir(runtimeDir, { recursive: true });
    await writeFile(join(runtimeDir, 'wake-recycle-last-input.md'), context.join('\n\n'), {
        mode: 0o600,
    }).catch((error: unknown) => {
        console.warn(
            `[WakeRecycle] agent=${input.agentId} evidence write failed: ${String(error)}`
        );
    });
    return context;
}

/**
 * The Computer keeps no durable copy of the messages a turn was offered (accepted-run records are
 * cleared at settlement), so the prototype appends each turn's inbox for the briefing to read.
 */
async function recordSeenInbox(input: {
    agentId: string;
    agentRoot: string;
    inbox: AgentInboxItem[];
}): Promise<void> {
    if (input.inbox.length === 0) {
        return;
    }
    const runtimeDir = join(input.agentRoot, 'runtime');
    const lines = input.inbox.map((item) =>
        JSON.stringify({
            content: item.content,
            createdAt: item.createdAt,
            id: item.id,
            senderHandle: item.senderHandle,
            target: item.target,
        })
    );
    await mkdir(runtimeDir, { recursive: true });
    await appendFile(join(runtimeDir, seenInboxFileName), `${lines.join('\n')}\n`, {
        mode: 0o600,
    }).catch((error: unknown) => {
        console.warn(`[WakeRecycle] agent=${input.agentId} inbox record failed: ${String(error)}`);
    });
}
