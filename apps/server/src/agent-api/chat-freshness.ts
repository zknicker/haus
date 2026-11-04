import { and, eq, gt, ne, or, sql } from 'drizzle-orm';
import { advanceSeenCursor, readAgentInboxCursor } from '../agent-delivery/cursors.ts';
import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentInboxExactVisibilityTable,
    chatMessagesTable,
    chatsTable,
} from '../postgres/schema.ts';
import { AgentChatViewStaleError } from './chat-freshness-errors.ts';

/**
 * Refuses when the Agent has an unread Message from someone else in the target
 * Chat, and otherwise advances its seen cursor. Sits beside `claim-freshness`,
 * the same query shape for the Claim lane.
 */
export async function assertFreshAgentView(
    db: HausDatabase,
    runner: ResolvedRunner,
    chatId: string
) {
    const cursor = await readAgentInboxCursor(db, { ...runner, chatId });
    const [chat] = await db
        .select({ latest: chatsTable.lastMessageSequence })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, runner.serverId), eq(chatsTable.id, chatId)))
        .limit(1);
    if (!chat) {
        throw new Error('The target Chat no longer exists.');
    }
    if (chat.latest <= cursor.seen) {
        return;
    }

    const relevant = and(
        eq(chatMessagesTable.serverId, runner.serverId),
        eq(chatMessagesTable.chatId, chatId),
        gt(chatMessagesTable.sequence, cursor.seen),
        sql`not exists (
            select 1 from ${agentInboxExactVisibilityTable} exact_visibility
            where exact_visibility.server_id = ${runner.serverId}
              and exact_visibility.agent_id = ${runner.agentId}
              and exact_visibility.session_generation = ${cursor.generation}
              and exact_visibility.chat_id = ${chatId}
              and exact_visibility.message_id = ${chatMessagesTable.id}
              and (
                exact_visibility.seen_at is not null
                or exact_visibility.served_run_id = ${runner.runId}
              )
        )`,
        or(
            sql`${chatMessagesTable.authorUserId} is not null`,
            and(
                sql`${chatMessagesTable.authorAgentId} is not null`,
                ne(chatMessagesTable.authorAgentId, runner.agentId)
            )
        )
    );
    const [unseen] = await db
        .select({ id: chatMessagesTable.id })
        .from(chatMessagesTable)
        .where(relevant)
        .limit(1);
    if (unseen) {
        throw new AgentChatViewStaleError();
    }
    await advanceSeenCursor(db, {
        agentId: runner.agentId,
        chatId,
        sequence: chat.latest,
        serverId: runner.serverId,
    });
}
