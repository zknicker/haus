import { and, eq } from 'drizzle-orm';

import { visibleChats } from '../chats/chat-visibility.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    channelParticipantsTable,
    chatReadsTable,
    chatsTable,
    taskFollowsTable,
} from '../postgres/schema.ts';

type PersonalWorkWriter = Pick<HausDatabase, 'delete' | 'insert' | 'select'>;

/**
 * The personal work one human holds on one Server today: Channel
 * participation, read markers, and Task follows. Authored messages, DMs, and
 * Tasks are deliberately untouched — those are collaboration history, not
 * personal work, and the membership row stays in place so they keep resolving
 * for participants whose stint did not end.
 *
 * Clearing returns every Chat the human just lost, including Task Chats, so
 * a caller that also revokes access can retire live composition state.
 */
export async function clearPersonalWork(
    db: PersonalWorkWriter,
    serverId: string,
    userId: string
): Promise<string[]> {
    const departed = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, serverId), visibleChats(userId)));

    await db
        .delete(channelParticipantsTable)
        .where(
            and(
                eq(channelParticipantsTable.serverId, serverId),
                eq(channelParticipantsTable.userId, userId)
            )
        );
    await db
        .delete(chatReadsTable)
        .where(and(eq(chatReadsTable.serverId, serverId), eq(chatReadsTable.readerUserId, userId)));
    await db
        .delete(taskFollowsTable)
        .where(and(eq(taskFollowsTable.serverId, serverId), eq(taskFollowsTable.userId, userId)));

    return departed.map((chat) => chat.id);
}

/** Joins one human to the Channel every Haus server creates for everyone. */
export async function joinAllChannel(
    db: Pick<HausDatabase, 'insert' | 'select'>,
    serverId: string,
    userId: string
): Promise<void> {
    const [allChannel] = await db
        .select({ id: chatsTable.id })
        .from(chatsTable)
        .where(and(eq(chatsTable.serverId, serverId), eq(chatsTable.isAll, true)))
        .limit(1);

    if (!allChannel) {
        throw new Error('This Haus server has no #all Channel to join.');
    }

    await db
        .insert(channelParticipantsTable)
        .values({ chatId: allChannel.id, serverId, userId })
        .onConflictDoNothing();
}
