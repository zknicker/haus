import { and, eq, isNotNull, isNull, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { linkParentChatsTable } from './cloud-agent-work-visibility.ts';

export async function isCloudAgentRequestChatLive(
    db: HausDatabase,
    input: { chatId: string; serverId: string }
) {
    const [chat] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .leftJoin(
            linkParentChatsTable,
            and(
                eq(linkParentChatsTable.serverId, chatsTable.serverId),
                eq(linkParentChatsTable.id, chatsTable.parentChatId)
            )
        )
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.id, input.chatId),
                isNull(chatsTable.deletedAt),
                or(
                    isNull(chatsTable.parentChatId),
                    and(isNotNull(linkParentChatsTable.id), isNull(linkParentChatsTable.deletedAt))
                )
            )
        )
        .limit(1);
    return chat !== undefined;
}
