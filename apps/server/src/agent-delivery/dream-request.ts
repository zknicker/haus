import type { AgentDreamRequest } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { isConfigured } from './deferred-configuration.ts';
import type { AgentDelivery } from './delivery.ts';
import { readAgentDispatchConfig } from './dispatch-config.ts';
import * as store from './store.ts';

/**
 * Queues one nightly dream for an Agent its Computer checked tonight. It queues
 * only for a configured, running Agent assigned to that Computer; a busy, paused,
 * or backed-off Agent, or one with work waiting, still gets its dream, which
 * ordinary delivery leads only once no other work is waiting. A dream therefore
 * never starts a stopped Agent and never runs in front of anyone's work, and one
 * still queued four hours later is retired. `dream:<agentId>:<localDate>` makes a
 * repeat on the same Computer-local night a no-op. Returns whether it was queued.
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
        if ((await store.readDeliveryState(tx, agentId))?.stopped) {
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
