import { and, eq, inArray, ne, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentDeliveryTable, agentInboxTable, chatMessagesTable } from '../postgres/schema.ts';

/** The claim columns liveness reads. */
export interface ClaimLivenessRow {
    assigneeAgentId: string | null;
    messageId: string;
}

/**
 * A claim is live while its assignee Agent's one in-flight run holds an inbox
 * row anchored on the claim's own message or on an inline reply to it —
 * attached to the run by a pull, or offered to it as a notice in the run's own
 * Chat. Liveness is volatile execution state derived at read time, never a
 * stored claim column; the run's start and its settlement both emit
 * `claim.updated`, so the App learns about it the same way it learns about
 * every other claim change.
 */
export async function loadLiveClaimMessageIds(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    rows: ClaimLivenessRow[]
): Promise<Set<string>> {
    const assigned = rows.filter((row) => row.assigneeAgentId !== null);
    if (assigned.length === 0) {
        return new Set();
    }
    const claimed = new Set(assigned.map((row) => `${row.assigneeAgentId} ${row.messageId}`));
    const agentIds = [...new Set(assigned.map((row) => row.assigneeAgentId as string))];
    const served = await db
        .select({
            agentId: agentInboxTable.agentId,
            dedupeKey: agentInboxTable.dedupeKey,
        })
        .from(agentInboxTable)
        .innerJoin(
            agentDeliveryTable,
            and(
                eq(agentDeliveryTable.agentId, agentInboxTable.agentId),
                or(
                    eq(agentDeliveryTable.activeRunId, agentInboxTable.runId),
                    and(
                        eq(agentDeliveryTable.activeRunId, agentInboxTable.noticeRunId),
                        eq(agentDeliveryTable.activeRunChatId, agentInboxTable.chatId)
                    )
                )
            )
        )
        .where(
            and(
                eq(agentInboxTable.serverId, serverId),
                inArray(agentInboxTable.agentId, agentIds),
                ne(agentInboxTable.state, 'seen')
            )
        );
    const parents = await readInlineParents(db, serverId, [
        ...new Set(served.map((row) => row.dedupeKey)),
    ]);
    const live = new Set<string>();
    for (const row of served) {
        for (const messageId of [row.dedupeKey, ...(parents.get(row.dedupeKey) ?? [])]) {
            if (claimed.has(`${row.agentId} ${messageId}`)) {
                live.add(messageId);
            }
        }
    }
    return live;
}

/** Each message's inline parent and root, by message id. */
async function readInlineParents(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    messageIds: string[]
): Promise<Map<string, string[]>> {
    if (messageIds.length === 0) {
        return new Map();
    }
    const rows = await db
        .select({
            id: chatMessagesTable.id,
            replyRootMessageId: chatMessagesTable.replyRootMessageId,
            replyToMessageId: chatMessagesTable.replyToMessageId,
        })
        .from(chatMessagesTable)
        .where(
            and(eq(chatMessagesTable.serverId, serverId), inArray(chatMessagesTable.id, messageIds))
        );
    return new Map(
        rows.map((row) => [
            row.id,
            [row.replyToMessageId, row.replyRootMessageId].filter((id): id is string => !!id),
        ])
    );
}
