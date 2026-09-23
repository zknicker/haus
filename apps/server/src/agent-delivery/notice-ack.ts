import type { AgentNoticeAck } from '@haus/api';
import { type EffectRuntime, settle } from '@haus/effect';
import { Effect } from 'effect';
import type { HausDatabase } from '../postgres/connection.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import * as store from './store.ts';

/**
 * A Computer injected an inbox notice into a running turn: the named queued work
 * is now noticed by that run. An ack for a run that is no longer the Agent's
 * accepted run marks nothing. Each consumed ack logs one `inbox-notice-acked` line.
 */
export async function consumeNoticeAck(
    db: HausDatabase,
    runtime: EffectRuntime<never> | undefined,
    input: Pick<AgentNoticeAck, 'agentId' | 'runId' | 'workIds'>
): Promise<void> {
    const serverId = await store.readAgentServerId(db, input.agentId);
    if (!serverId) {
        return;
    }
    const noticedItems = await db.transaction(async (tx) => {
        await lockServerRow(tx, serverId);
        const state = await store.readDeliveryState(tx, input.agentId);
        if (state?.activeRunId !== input.runId || state.acceptedAt === null) {
            return null;
        }
        const queued = await store.listQueuedItems(tx, input.agentId, 1000);
        const noticed = queued.filter((row) => input.workIds.includes(row.dedupeKey));
        await store.markInboxItemsNoticed(tx, {
            agentId: input.agentId,
            itemIds: noticed.map((row) => row.id),
            runId: input.runId,
        });
        return noticed.length;
    });
    if (runtime) {
        await settle(
            runtime,
            Effect.logInfo('Agent notice acknowledgment consumed.').pipe(
                Effect.annotateLogs({
                    agentId: input.agentId,
                    event: 'inbox-notice-acked',
                    noticedItems,
                    runId: input.runId,
                    workItems: input.workIds.length,
                })
            )
        );
    }
}
