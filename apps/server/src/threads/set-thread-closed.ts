import { and, eq, sql } from 'drizzle-orm';
import { requireChatAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, threadClosuresTable } from '../postgres/schema.ts';
import { threadClosedUpdatedTopic } from '../realtime/topics.ts';
import type { HausUser } from '../users/haus-user.ts';

/** Close files a Thread under Earlier for one human; Reopen deletes the row. */
export async function setThreadClosed(
    db: HausDatabase,
    member: HausUser | null,
    input: { closed: boolean; serverId: string; threadChatId: string }
) {
    const thread = await requireChatAccess(db, member, {
        chatId: input.threadChatId,
        serverId: input.serverId,
    });
    if (!(member && thread.kind === 'thread')) {
        throw new Error('Closing requires a child Thread.');
    }
    const key = and(
        eq(threadClosuresTable.serverId, input.serverId),
        eq(threadClosuresTable.threadChatId, input.threadChatId),
        eq(threadClosuresTable.userId, member.id)
    );
    if (input.closed) {
        const [newest] = await db
            .select({ sequence: sql<number>`coalesce(max(${chatMessagesTable.sequence}), 0)` })
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.serverId, input.serverId),
                    eq(chatMessagesTable.chatId, input.threadChatId)
                )
            );
        const closedThroughSequence = newest?.sequence ?? 0;
        await db
            .insert(threadClosuresTable)
            .values({
                closedThroughSequence,
                serverId: input.serverId,
                threadChatId: input.threadChatId,
                userId: member.id,
            })
            .onConflictDoUpdate({
                set: { closedAt: sql`now()`, closedThroughSequence },
                target: [
                    threadClosuresTable.serverId,
                    threadClosuresTable.threadChatId,
                    threadClosuresTable.userId,
                ],
            });
    } else {
        await db.delete(threadClosuresTable).where(key);
    }
    return threadClosedUpdatedTopic.prepare(
        { closed: input.closed, serverId: input.serverId, threadChatId: input.threadChatId },
        { audienceUserId: member.id }
    );
}
