import type { UnreadElsewhere } from '@haus/api';
import { and, isNotNull, notInArray, sql } from 'drizzle-orm';
import { targetForChat as targetForAgentChat } from '../agent-api/message-view.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentInboxTable } from '../postgres/schema.ts';
import { noticeable, queuedFor } from './store.ts';

/** The digest is a hint, not an index: a long tail of chats stays bounded. */
const maxUnreadElsewhereChats = 50;

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
    const counts = await countQueuedItemsByChat(db, {
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

/** Per-chat queued counts behind the digest; chatless attentions are never counted. */
async function countQueuedItemsByChat(
    db: HausDatabase,
    input: { agentId: string; excludeChatIds: string[]; excludeItemIds: string[] }
): Promise<Array<{ chatId: string; count: number }>> {
    const rows = await db
        .select({ chatId: agentInboxTable.chatId, total: sql<number>`count(*)::int` })
        .from(agentInboxTable)
        .where(
            and(
                queuedFor(input.agentId),
                noticeable(),
                isNotNull(agentInboxTable.chatId),
                input.excludeChatIds.length > 0
                    ? notInArray(agentInboxTable.chatId, input.excludeChatIds)
                    : undefined,
                input.excludeItemIds.length > 0
                    ? notInArray(agentInboxTable.id, input.excludeItemIds)
                    : undefined
            )
        )
        .groupBy(agentInboxTable.chatId)
        .orderBy(agentInboxTable.chatId)
        .limit(maxUnreadElsewhereChats);
    return rows.flatMap((row) => (row.chatId ? [{ chatId: row.chatId, count: row.total }] : []));
}
