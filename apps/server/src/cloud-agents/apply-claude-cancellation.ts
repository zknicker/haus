import type { CloudAgentObservation, CloudAgentProvider } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    cloudAgentInputTable,
    cloudAgentRunsTable,
    cloudAgentWorkTable,
} from '../postgres/schema.ts';
import { prepareCloudAgentWorkEvents } from './cloud-agent-events.ts';
import type { AppliedCloudAgentObservation } from './cloud-agent-observation-result.ts';
import { isCloudAgentRequestChatLive } from './cloud-agent-request-chat.ts';
import { findCloudAgentWork } from './cloud-agent-shape.ts';

interface CancellationWork {
    agentId: string;
    cancelRequestedAt: Date | null;
    chatId: string;
    provider: CloudAgentProvider;
    providerAgentId: string | null;
    providerRunId: string | null;
    terminalAt: Date | null;
}

/** A matched Computer interrupt receipt settles the whole frozen Claude session, including local queued Runs. */
export async function applyClaudeCancellation(
    db: HausDatabase,
    input: { serverId: string; observation: CloudAgentObservation },
    row: CancellationWork,
    delivery: AgentDelivery
): Promise<{ handled: false } | { handled: true; result: AppliedCloudAgentObservation | null }> {
    if (row.provider !== 'claude' || input.observation.status !== 'cancelled') {
        return { handled: false };
    }
    if (!row.cancelRequestedAt || row.terminalAt) {
        return { handled: true, result: null };
    }
    const notLaunched =
        input.observation.rawStatus === 'NOT_LAUNCHED' &&
        row.providerAgentId === null &&
        row.providerRunId === null &&
        !input.observation.providerAgentId &&
        !input.observation.providerRunId;
    if (!(input.observation.rawStatus === 'INTERRUPTED' || notLaunched)) {
        return { handled: true, result: null };
    }
    const runs = await db
        .select({ id: cloudAgentRunsTable.id })
        .from(cloudAgentRunsTable)
        .where(
            and(
                eq(cloudAgentRunsTable.serverId, input.serverId),
                eq(cloudAgentRunsTable.workId, input.observation.workId),
                inArray(cloudAgentRunsTable.status, ['queued', 'running', 'pending_input'])
            )
        );
    if (runs.length === 0) {
        return { handled: true, result: null };
    }
    const ids = runs.map((run) => run.id);
    const now = new Date();
    await db
        .update(cloudAgentRunsTable)
        .set({
            status: 'cancelled',
            terminalAt: now,
            observedAt: now,
            rawStatus: input.observation.rawStatus ?? null,
            summary: input.observation.summary ?? null,
        })
        .where(
            and(
                eq(cloudAgentRunsTable.serverId, input.serverId),
                inArray(cloudAgentRunsTable.id, ids)
            )
        );
    await db
        .update(cloudAgentInputTable)
        .set({ state: 'cancelled' })
        .where(
            and(
                eq(cloudAgentInputTable.serverId, input.serverId),
                inArray(cloudAgentInputTable.runId, ids),
                inArray(cloudAgentInputTable.state, ['pending', 'answered'])
            )
        );
    await db
        .update(cloudAgentWorkTable)
        .set({ status: 'cancelled', terminalAt: now, updatedAt: now })
        .where(
            and(
                eq(cloudAgentWorkTable.serverId, input.serverId),
                eq(cloudAgentWorkTable.id, input.observation.workId)
            )
        );
    const notifying = await isCloudAgentRequestChatLive(db, {
        serverId: input.serverId,
        chatId: row.chatId,
    });
    if (notifying) {
        for (const runId of ids) {
            await delivery.enqueue(db, {
                serverId: input.serverId,
                agentId: row.agentId,
                chatId: row.chatId,
                content: '',
                source: 'cloud_agent_work',
                dedupeKey: runId,
            });
        }
    }
    const work = await findCloudAgentWork(db, input.serverId, input.observation.workId);
    if (!work) {
        throw new Error('Cloud Agent work disappeared after confirmed cancellation.');
    }
    return {
        handled: true,
        result: {
            work,
            events: await prepareCloudAgentWorkEvents(db, {
                serverId: input.serverId,
                workId: work.id,
            }),
            wake: notifying ? { serverId: input.serverId, agentId: row.agentId } : null,
        },
    };
}
