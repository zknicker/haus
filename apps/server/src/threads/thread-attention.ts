import { and, eq, isNull, sql } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import { mentionedUserIds } from '../chats/mentioned-user-ids.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, serverMembershipsTable, threadFollowsTable } from '../postgres/schema.ts';

export async function autoFollowThreadMentions(
    db: HausDatabase,
    input: { content: string; parentChatId: string; serverId: string; threadChatId: string }
) {
    for (const userId of mentionedUserIds(input.content)) {
        const [eligible] = await db
            .select({ id: serverMembershipsTable.userId })
            .from(serverMembershipsTable)
            .innerJoin(
                chatsTable,
                and(
                    eq(chatsTable.serverId, serverMembershipsTable.serverId),
                    eq(chatsTable.id, input.parentChatId)
                )
            )
            .where(
                and(
                    eq(serverMembershipsTable.serverId, input.serverId),
                    eq(serverMembershipsTable.userId, userId),
                    isNull(serverMembershipsTable.revokedAt),
                    visibleChats(userId)
                )
            )
            .limit(1);

        if (!eligible) {
            continue;
        }

        await db
            .insert(threadFollowsTable)
            .values({
                serverId: input.serverId,
                threadChatId: input.threadChatId,
                userId,
            })
            .onConflictDoUpdate({
                set: { followed: true, updatedAt: sql`now()` },
                target: [
                    threadFollowsTable.serverId,
                    threadFollowsTable.threadChatId,
                    threadFollowsTable.userId,
                ],
            });
    }
}
