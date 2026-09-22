import type { UnreadElsewhere } from '@haus/api';
import { targetForChat as targetForAgentChat } from '../agent-api/message-view.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import * as store from './store.ts';

/**
 * Raft's per-wake digest of queued work this frame does not carry. The two
 * exclusions are not symmetric: a notice row states its target's whole pending
 * count, so that chat is represented and drops out entirely, while a drained
 * item represents only itself — which is what keeps same-chat work past the
 * drain budget visible instead of silently queued (specs/inbox.md).
 */
export async function readUnreadElsewhere(
    db: HausDatabase,
    input: {
        agentId: string;
        drainedItemIds: string[];
        representedChatIds: string[];
        serverId: string;
    }
): Promise<UnreadElsewhere[]> {
    const counts = await store.countQueuedItemsByChat(db, {
        agentId: input.agentId,
        excludeChatIds: input.representedChatIds,
        excludeItemIds: input.drainedItemIds,
    });
    const entries: UnreadElsewhere[] = [];
    // Sequential: planning runs inside the transaction holding the Server row,
    // and overlapping reads on its one connection wedge it.
    for (const row of counts) {
        entries.push({
            count: row.count,
            target: await targetForAgentChat(db, input.serverId, row.chatId),
        });
    }
    return entries.sort((left, right) => left.target.localeCompare(right.target));
}
