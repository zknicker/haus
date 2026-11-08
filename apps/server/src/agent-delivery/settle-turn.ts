import type { AgentTurnSummary } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { AgentDelivery } from './delivery.ts';
import { clearDeliveryFailures } from './failure-hold.ts';
import { readAgentServerId } from './store.ts';
import { markItemsUndeliverable } from './undeliverable-items.ts';

/**
 * Settles a reported turn. A start the Computer rejected because of specific
 * items is the items' fault, not the Agent's: they leave the queue, the turn's
 * failure holds nothing back, and the rest of the queue goes out again at once.
 */
export async function settleTurn(
    db: HausDatabase,
    delivery: Pick<AgentDelivery, 'dispatchAgent' | 'onTurnSettled'>,
    computerId: string,
    summary: AgentTurnSummary
): Promise<void> {
    const rejected = summary.rejectedItems ?? [];
    const serverId = rejected.length > 0 ? await readAgentServerId(db, summary.agentId) : null;
    const set = serverId
        ? await markItemsUndeliverable(db, { agentId: summary.agentId, serverId }, rejected)
        : 0;
    await delivery.onTurnSettled(computerId, summary);
    if (serverId && set > 0) {
        await clearDeliveryFailures(db, summary.agentId);
        await delivery.dispatchAgent(summary.agentId, serverId);
    }
}
