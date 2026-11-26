import type { AgentActivityEvent } from '@haus/api';
import { and, eq } from 'drizzle-orm';
import { publishCommittedAgentActivity } from '../agent-delivery/activity-events.ts';
import { publishAgentLifecycle } from '../agent-delivery/lifecycle.ts';
import { resetInTransaction } from '../agent-delivery/reset-transaction.ts';
import { deleteQueuedOrdinaryItems, setStopped } from '../agent-delivery/store.ts';
import type { InvocationRouter } from '../agent-invocations/invocation-router.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import { type PreparedRealtimeEvent, publishRealtime } from '../realtime/topic.ts';
import type { RunnerLink } from '../runner/runner-link.ts';

export interface TaskSessionReset {
    activity: AgentActivityEvent | null;
    agentId: string;
    archived: boolean;
    claimEvents: PreparedRealtimeEvent[];
    computerId: string;
    generation: number;
    killedRun: { chatId: string | null; runId: string } | null;
    serverId: string;
}

export interface TaskSessionWire {
    invocations: Pick<InvocationRouter, 'archiveSession'>;
    runner: Pick<RunnerLink, 'send'>;
}

export async function rotateTaskSession(
    tx: HausDatabase,
    input: { agentId: string; archived: boolean; chatId: string; serverId: string }
) {
    const { agentId, serverId } = input;
    const reset = await resetInTransaction(tx, { agentId, kind: 'session', serverId });
    await tx
        .update(agentsTable)
        .set({ sessionResetKind: 'full' })
        .where(and(eq(agentsTable.serverId, serverId), eq(agentsTable.id, agentId)));
    await setStopped(tx, { agentId, serverId, stopped: input.archived });
    if (input.archived) {
        await deleteQueuedOrdinaryItems(tx, { agentId, chatIds: [input.chatId], serverId });
    }
    if (!reset.computerId) {
        throw new Error(`Task agent ${agentId} has no Machine.`);
    }
    const rotated: TaskSessionReset = {
        activity: reset.activity,
        agentId,
        archived: input.archived,
        claimEvents: reset.claimEvents,
        computerId: reset.computerId,
        generation: reset.sessionGeneration,
        killedRun: reset.runId ? { chatId: reset.chatId, runId: reset.runId } : null,
        serverId,
    };
    return rotated;
}

export function announceTaskSessions(wire: TaskSessionWire, resets: readonly TaskSessionReset[]) {
    for (const reset of resets) {
        const { agentId, serverId } = reset;
        if (reset.activity) {
            publishCommittedAgentActivity(reset.activity);
        }
        publishRealtime(reset.claimEvents);
        if (reset.killedRun) {
            publishAgentLifecycle({
                agentId,
                chatId: reset.killedRun.chatId,
                outcome: 'stopped',
                phase: 'settled',
                runId: reset.killedRun.runId,
                serverId,
            });
        }
        if (reset.archived) {
            wire.runner.send({
                agentId,
                kind: 'archive',
                sessionGeneration: reset.generation,
                type: 'agent-reset',
            });
            wire.invocations.archiveSession({
                agentId,
                computerId: reset.computerId,
                generation: reset.generation,
                serverId,
            });
        }
    }
}
