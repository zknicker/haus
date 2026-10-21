import type { AgentSubagentWakeRequest } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { isConfigured } from './deferred-configuration.ts';
import type { AgentDelivery } from './delivery.ts';
import { readAgentDispatchConfig } from './dispatch-config.ts';
import * as store from './store.ts';

/**
 * Queues a sub-agent wake its Computer asked for: background work the Agent started finished
 * or stopped after the turn that started it (specs/runtime-drivers.md "Background work"). It
 * queues only for a configured, running Agent assigned to that Computer, in the session
 * generation the work ran in, so a wake that crosses a session reset is dropped. One queued
 * wake covers every report: several finishing at once share one turn. Returns whether it
 * queued.
 */
export async function requestSubagentWake(
    db: HausDatabase,
    delivery: AgentDelivery,
    input: { computerId: string; request: AgentSubagentWakeRequest; serverId: string }
): Promise<boolean> {
    const { agentId, sessionGeneration, wakeId } = input.request;
    const queued = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if ((await store.readAgentServerId(tx, agentId)) !== input.serverId) {
            return false;
        }
        const config = await readAgentDispatchConfig(tx, agentId);
        if (
            !(
                isConfigured(config) &&
                config.computerId === input.computerId &&
                config.sessionGeneration === sessionGeneration
            )
        ) {
            return false;
        }
        if ((await store.readDeliveryState(tx, agentId))?.stopped) {
            return false;
        }
        const [pending] = await tx
            .select({ id: agentInboxTable.id })
            .from(agentInboxTable)
            .where(
                and(
                    eq(agentInboxTable.agentId, agentId),
                    eq(agentInboxTable.source, 'subagent'),
                    eq(agentInboxTable.state, 'queued'),
                    isNull(agentInboxTable.runId)
                )
            )
            .limit(1);
        if (pending) {
            return false;
        }
        await delivery.enqueue(tx, {
            agentId,
            chatId: null,
            content: '',
            dedupeKey: `subagent:${agentId}:${wakeId}`,
            serverId: input.serverId,
            source: 'subagent',
        });
        return true;
    });
    if (queued) {
        await delivery.dispatchAgent(agentId, input.serverId);
    }
    return queued;
}

/**
 * Retires an Agent's queued sub-agent wakes as `seen` when Stop or a session reset ends the
 * background work they would report.
 */
export async function retireQueuedSubagentWakes(db: HausDatabase, agentId: string): Promise<void> {
    await db
        .update(agentInboxTable)
        .set({ seenAt: new Date(), state: 'seen' })
        .where(
            and(
                eq(agentInboxTable.agentId, agentId),
                eq(agentInboxTable.source, 'subagent'),
                eq(agentInboxTable.state, 'queued'),
                isNull(agentInboxTable.runId)
            )
        );
}
