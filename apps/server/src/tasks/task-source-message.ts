import { and, eq, isNull } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable } from '../postgres/schema.ts';
import { actorVisibleChats } from './actor-visible-chats.ts';
import type { TaskActor } from './task-actor.ts';
import { TaskInvariantError } from './task-errors.ts';

/**
 * Convert to Task's source: any message the actor can read. A message they
 * cannot read is refused exactly like a missing one, so the refusal leaks
 * nothing about Chats they cannot see.
 */
export async function readSourceMessage(
    db: Pick<HausDatabase, 'select'>,
    actor: TaskActor,
    input: { messageId: string; serverId: string }
): Promise<{ content: string; id: string }> {
    const [message] = await db
        .select({ content: chatMessagesTable.content, id: chatMessagesTable.id })
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
                eq(chatMessagesTable.id, input.messageId),
                isNull(chatsTable.deletedAt),
                actorVisibleChats(actor)
            )
        )
        .limit(1);
    if (!message) {
        throw new TaskInvariantError('The source message does not exist or you cannot read it.');
    }
    return message;
}
