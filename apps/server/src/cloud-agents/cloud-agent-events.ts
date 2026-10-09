import { and, eq } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { cloudAgentWorkUpdatedTopic } from '../realtime/topics.ts';

export interface CloudAgentEventChat {
    kind: 'channel' | 'dm' | 'thread';
    parentChatId: string | null;
}

/**
 * Prepares `cloudAgentWork.updated` for one work lifecycle change about to
 * commit. Clients refetch the work Message; the event carries only ids.
 */
export function prepareCloudAgentWorkEvent(input: {
    chat: CloudAgentEventChat;
    chatId: string;
    cloudAgentWorkId: string;
    messageId: string;
    serverId: string;
}) {
    return cloudAgentWorkUpdatedTopic.prepare({
        chatId: input.chatId,
        messageId: input.messageId,
        parentChatId: input.chat.kind === 'thread' ? input.chat.parentChatId : null,
        serverId: input.serverId,
        workId: input.cloudAgentWorkId,
    });
}

/** The Chat placement one lifecycle event needs. */
export async function readCloudAgentEventChat(
    db: Pick<HausDatabase, 'select'>,
    input: { messageId: string; serverId: string }
): Promise<CloudAgentEventChat> {
    const [row] = await db
        .select({ kind: chatsTable.kind, parentChatId: chatsTable.parentChatId })
        .from(chatMessagesTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, chatMessagesTable.serverId),
                eq(chatsTable.id, chatMessagesTable.chatId)
            )
        )
        .where(
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.id, input.messageId)
            )
        )
        .limit(1);
    if (!row) {
        throw new Error('The Cloud Agent work Message no longer exists.');
    }
    return { kind: row.kind, parentChatId: row.parentChatId };
}
