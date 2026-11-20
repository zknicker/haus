import { and, eq, inArray, or } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, remindersTable } from '../postgres/schema.ts';

export function remindersAnchoredIn(
    db: Pick<HausDatabase, 'select'>,
    input: { chatIds: string[]; serverId: string }
) {
    return and(
        eq(remindersTable.serverId, input.serverId),
        or(
            inArray(remindersTable.anchorChatId, input.chatIds),
            inArray(
                remindersTable.anchorMessageId,
                db
                    .select({ id: chatMessagesTable.id })
                    .from(chatMessagesTable)
                    .where(
                        and(
                            eq(chatMessagesTable.serverId, input.serverId),
                            inArray(chatMessagesTable.chatId, input.chatIds)
                        )
                    )
            )
        )
    );
}
