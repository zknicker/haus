import { and, eq } from 'drizzle-orm';
import { requireChatWritable } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { TaskInvariantError } from './task-errors.ts';

export async function requireStartOrigin(
    tx: HausDatabase,
    input: { chatId: string; messageId: string; serverId: string }
) {
    const [origin] = await tx
        .select({ kind: chatsTable.kind })
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
                eq(chatMessagesTable.chatId, input.chatId),
                eq(chatMessagesTable.id, input.messageId)
            )
        )
        .limit(1);
    if (!origin) {
        throw new TaskInvariantError('The origin Message is not in that Chat.');
    }
    if (origin.kind === 'task') {
        throw new TaskInvariantError(
            'Tasks start from a Message in a Channel or DM, not one inside a Task.'
        );
    }
    await requireChatWritable(tx, { chatId: input.chatId, serverId: input.serverId });
    return { chatId: input.chatId, messageId: input.messageId };
}
