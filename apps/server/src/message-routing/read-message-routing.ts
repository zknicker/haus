import type { MessageRoutingDebug } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import { ChatNotFoundError, requireChatAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable, chatMessagesTable } from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';

export async function readMessageRouting(
    db: HausDatabase,
    member: HausUser | null,
    input: { serverId: string; messageId: string }
): Promise<MessageRoutingDebug> {
    const [message] = await db
        .select({ chatId: chatMessagesTable.chatId, audit: chatMessagesTable.deliveryRouting })
        .from(chatMessagesTable)
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.id, input.messageId)
            )
        )
        .limit(1);
    if (!message) {
        throw new ChatNotFoundError();
    }
    await requireChatAccess(db, member, { serverId: input.serverId, chatId: message.chatId });
    const ids = [
        ...new Set([
            ...(message.audit?.candidateAgentIds ?? []),
            ...(message.audit?.recipientAgentIds ?? []),
        ]),
    ];
    const agents = ids.length
        ? await db
              .select({ id: agentsTable.id, displayName: agentsTable.displayName })
              .from(agentsTable)
              .where(and(eq(agentsTable.serverId, input.serverId), inArray(agentsTable.id, ids)))
        : [];
    return { audit: message.audit, agents };
}
