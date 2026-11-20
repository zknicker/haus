import type { AgentTurnSummary } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import type { AgentDelivery } from './delivery.ts';
import { clearDeliveryFailures } from './failure-hold.ts';
import type { AgentLoopHost } from './loop-host.ts';
import { readAgentServerId } from './store.ts';
import { markItemsUndeliverable } from './undeliverable-items.ts';

/**
 * Settles a turn `host` reported. A start the host rejected because of specific
 * items is the items' fault, not the Agent's: they leave the queue, the turn's
 * failure holds nothing back, and the rest of the queue goes out again at once.
 */
export async function settleHostedTurn(
    db: HausDatabase,
    delivery: Pick<AgentDelivery, 'dispatchAgent' | 'onHostedTurnSettled'>,
    host: AgentLoopHost,
    summary: AgentTurnSummary
): Promise<void> {
    const rejected = summary.rejectedItems ?? [];
    const serverId = rejected.length > 0 ? await readAgentServerId(db, summary.agentId) : null;
    const set = serverId
        ? await markItemsUndeliverable(db, { agentId: summary.agentId, serverId }, rejected)
        : 0;
    await delivery.onHostedTurnSettled(host, summary);
    if (serverId && set > 0) {
        await clearDeliveryFailures(db, summary.agentId);
        await delivery.dispatchAgent(summary.agentId, serverId);
    }
}
