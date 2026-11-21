import { and, eq } from 'drizzle-orm';
import { ensureInlineReplyParticipants } from '../chats/reply-subscriptions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentMessageFollowsTable, chatMessagesTable } from '../postgres/schema.ts';

export async function readInlineReplyChain(
    db: HausDatabase,
    input: {
        authorAgentId: string | null;
        chatId: string;
        content: string;
        messageId: string;
        serverId: string;
    }
) {
    const [message] = await db
        .select({ id: chatMessagesTable.id, replyToMessageId: chatMessagesTable.replyToMessageId })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.chatId, input.chatId),
                eq(chatMessagesTable.id, input.messageId)
            )
        )
        .limit(1);
    if (!message) {
        return null;
    }
    const rootMessageId = await ensureInlineReplyParticipants(db, input);
    if (!message.replyToMessageId) {
        return null;
    }
    const rows = await db
        .select({
            agentId: agentMessageFollowsTable.agentId,
            followed: agentMessageFollowsTable.followed,
        })
        .from(agentMessageFollowsTable)
        .where(
            and(
                eq(agentMessageFollowsTable.serverId, input.serverId),
                eq(agentMessageFollowsTable.chatId, input.chatId),
                eq(agentMessageFollowsTable.rootMessageId, rootMessageId ?? message.id)
            )
        );
    return new Map(rows.map((row) => [row.agentId, row.followed]));
}
