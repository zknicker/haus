import type { AgentDreamRequest } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { isConfigured } from './deferred-configuration.ts';
import type { AgentDelivery } from './delivery.ts';
import { readAgentDispatchConfig } from './dispatch-config.ts';
import { isBackedOff } from './retry-policy.ts';
import * as store from './store.ts';

/**
 * Queues one nightly dream for an Agent its Computer reports as changed and idle.
 * The Server is the authority on idle: it queues only for a configured, running
 * Agent assigned to that Computer, with no active run, no work waiting to wake it,
 * and no wake pause or backoff. A dream therefore never starts a stopped Agent and never
 * waits in front of anyone's work; a declined request is simply retried by the
 * Computer's next quiet-window check. `dream:<agentId>:<localDate>` makes a repeat
 * on the same Computer-local night a no-op. Returns whether the Agent was woken.
 */
export async function requestAgentDream(
    db: HausDatabase,
    delivery: AgentDelivery,
    input: { computerId: string; request: AgentDreamRequest; serverId: string }
): Promise<boolean> {
    const { agentId, localDate } = input.request;
    const queued = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        if ((await store.readAgentServerId(tx, agentId)) !== input.serverId) {
            return false;
        }
        const config = await readAgentDispatchConfig(tx, agentId);
        if (!(isConfigured(config) && config.computerId === input.computerId)) {
            return false;
        }
        const state = await store.readDeliveryState(tx, agentId);
        if (state && (state.stopped || state.activeRunId || state.pausedAt || isBackedOff(state))) {
            return false;
        }
        // Only work that would start its own run is waiting. Rows a settled run already
        // offered stay pending without waking the Agent again, so they never block a dream.
        const waiting = [
            ...(await store.listUnnoticedQueuedItems(tx, agentId, 1)),
            ...(await store.listQueuedConcreteItems(tx, agentId, 1)),
        ];
        if (waiting.length > 0) {
            return false;
        }
        await delivery.enqueue(tx, {
            agentId,
            chatId: null,
            content: '',
            dedupeKey: `dream:${agentId}:${localDate}`,
            serverId: input.serverId,
            source: 'dream',
        });
        return true;
    });
    if (queued) {
        await delivery.dispatchAgent(agentId, input.serverId);
    }
    return queued;
}
