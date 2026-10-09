import { sql } from 'drizzle-orm';
import { requireChatAccess } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { threadFollowsTable } from '../postgres/schema.ts';
import { threadFollowUpdatedTopic } from '../realtime/topics.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import { ensureThread } from './ensure-thread.ts';
import { requireThreadAccess } from './resolve-thread-access.ts';

export async function setThreadFollow(
    db: HausDatabase,
    member: HausUser | null,
    input: { follow: boolean; serverId: string; threadChatId: string }
) {
    return await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);

        // Deliberately following a Thread nobody has replied in is a real act of
        // attention, so it is one of the few writes that materializes the Thread.
        const pending = await requireThreadAccess(tx, member, input);
        if (!pending.materialized) {
            await ensureThread(tx, member, {
                anchorMessageId: pending.anchorMessageId,
                parentChatId: pending.parentChatId,
                serverId: input.serverId,
            });
        }

        const thread = await requireChatAccess(tx, member, {
            chatId: input.threadChatId,
            serverId: input.serverId,
        });

        if (!(member && thread.kind === 'thread')) {
            throw new Error('Thread follow state requires a child Thread.');
        }

        await tx
            .insert(threadFollowsTable)
            .values({
                followed: input.follow,
                serverId: input.serverId,
                threadChatId: input.threadChatId,
                userId: member.id,
            })
            .onConflictDoUpdate({
                set: { followed: input.follow, updatedAt: sql`now()` },
                target: [
                    threadFollowsTable.serverId,
                    threadFollowsTable.threadChatId,
                    threadFollowsTable.userId,
                ],
            });
        return {
            event: threadFollowUpdatedTopic.prepare(
                {
                    anchorMessageId: pending.anchorMessageId,
                    followed: input.follow,
                    parentChatId: pending.parentChatId,
                    serverId: input.serverId,
                    threadChatId: input.threadChatId,
                },
                { audienceUserId: member.id }
            ),
            receipt: {
                followed: input.follow,
                serverId: input.serverId,
                threadChatId: input.threadChatId,
            },
        };
    });
}
