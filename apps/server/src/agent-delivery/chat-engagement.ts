import type { ChatEngagement } from '@haus/api';
import { and, eq, isNotNull, isNull, or, type SQL, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentDeliveryTable,
    agentInboxTable,
    chatMessagesTable as message,
    agentInboxExactVisibilityTable as visibility,
} from '../postgres/schema.ts';

/**
 * At or below this Jev probability that a message wants a reply, reading it does
 * not engage the Chat. Null, uncertain, and missing judgments still engage.
 */
export const replySuppressionThreshold = 0.2;

/**
 * Chat engagement (ADR 0034), derived only from durable delivery state so a
 * reload, reconnect, or resent turn reproduces it exactly. Agent A's run R
 * engages Chat C while R is accepted and unsettled and holds exact visibility
 * of a human message in C that is newer than A's last message in C and was not
 * judged to want no reply. A send into C or R's settlement ends it.
 */
export async function readChatEngagements(
    db: HausDatabase,
    input: { chatId: string; serverId: string }
): Promise<ChatEngagement[]> {
    return await selectEngagements(
        db,
        and(
            eq(visibility.serverId, input.serverId),
            eq(visibility.chatId, input.chatId),
            activeRun()
        )
    );
}

/** The Chats an accepted, unsettled run engages now. Empty once the run settles. */
export async function readActiveRunEngagements(
    db: HausDatabase,
    input: { agentId: string; runId: string; serverId: string }
): Promise<ChatEngagement[]> {
    return await selectEngagements(db, and(runFilter(input), activeRun()));
}

/**
 * The Chats a run engaged at the moment it settled. Settlement cleared the
 * active run, so this reads the run's own visibility rather than delivery state.
 */
export async function readSettledRunEngagements(
    db: HausDatabase,
    input: { agentId: string; runId: string; serverId: string }
): Promise<ChatEngagement[]> {
    return await selectEngagements(db, runFilter(input));
}

async function selectEngagements(db: HausDatabase, filter: SQL | undefined) {
    // Postgres resolves the unaliased outer `chat_messages` columns inside the
    // aliased subquery, so this is the Agent's latest message in the same Chat.
    const lastOwnSequence = sql`coalesce((
        select max(own.sequence) from chat_messages own
        where own.server_id = ${message.serverId}
          and own.chat_id = ${message.chatId}
          and own.author_agent_id = ${visibility.agentId}
    ), 0)`;
    const rows = await db
        .select({
            agentId: visibility.agentId,
            chatId: visibility.chatId,
            runId: visibility.servedRunId,
            startedAt: sql<
                Date | string
            >`min(coalesce(${visibility.servedAt}, ${visibility.createdAt}))`,
        })
        .from(visibility)
        .innerJoin(
            message,
            and(eq(message.serverId, visibility.serverId), eq(message.id, visibility.messageId))
        )
        .leftJoin(
            agentInboxTable,
            and(
                eq(agentInboxTable.serverId, visibility.serverId),
                eq(agentInboxTable.agentId, visibility.agentId),
                eq(agentInboxTable.dedupeKey, visibility.messageId)
            )
        )
        .where(
            and(
                filter,
                isNotNull(visibility.servedRunId),
                isNotNull(message.authorUserId),
                // The column is `real`; compare in its precision so 0.2 suppresses.
                or(
                    isNull(agentInboxTable.expectsReply),
                    sql`${agentInboxTable.expectsReply} > ${replySuppressionThreshold}::real`
                ),
                sql`${message.sequence} > ${lastOwnSequence}`
            )
        )
        .groupBy(visibility.agentId, visibility.chatId, visibility.servedRunId);
    return rows
        .flatMap((row) =>
            row.runId
                ? [
                      {
                          agentId: row.agentId,
                          chatId: row.chatId,
                          runId: row.runId,
                          startedAt: new Date(row.startedAt).toISOString(),
                      },
                  ]
                : []
        )
        .sort((left, right) => left.startedAt.localeCompare(right.startedAt));
}

function runFilter(input: { agentId: string; runId: string; serverId: string }) {
    return and(
        eq(visibility.serverId, input.serverId),
        eq(visibility.agentId, input.agentId),
        eq(visibility.servedRunId, input.runId)
    );
}

/**
 * The visibility row belongs to its Agent's accepted, unsettled run. Driven
 * from the few active runs so the run index, not the whole ledger, is read.
 */
function activeRun() {
    return sql`(${visibility.agentId}, ${visibility.servedRunId}) in (
        select ${agentDeliveryTable.agentId}, ${agentDeliveryTable.activeRunId}
        from ${agentDeliveryTable}
        where ${agentDeliveryTable.serverId} = ${visibility.serverId}
          and ${agentDeliveryTable.activeRunId} is not null
          and ${agentDeliveryTable.acceptedAt} is not null
    )`;
}
