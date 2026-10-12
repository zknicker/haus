import type { UnreadThread } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { chatLastMessageLateral, toChatLastMessage } from '../chats/chat-last-message.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    threadCountedReply,
    threadFirstUnreadMessageId,
    threadFirstUnreadSequence,
    threadUnreadCount,
    unreadThreads,
} from './thread-unread.ts';

/**
 * The member's unread Threads on one Server, newest activity first: the
 * Inbox's Thread rows (ADR 0043). `unreadThreads` decides the set, the same
 * predicate the badge counts with.
 */
export async function listUnreadThreads(
    db: HausDatabase,
    member: Pick<HausUser, 'id'> | null,
    serverId: string
): Promise<UnreadThread[]> {
    await requireServerMembership(db, member, serverId);

    if (!member) {
        return [];
    }

    // The preview is the newest counted reply, the same rule as the count; the
    // row still sorts by the Thread's activity, which the viewer's own reply moves.
    const lastMessage = chatLastMessageLateral(db, threadCountedReply(member.id));
    const rows = await db
        .select({
            anchorMessageId: chatsTable.anchorMessageId,
            firstUnreadMessageId: threadFirstUnreadMessageId(member.id),
            firstUnreadSequence: threadFirstUnreadSequence(member.id),
            lastActivityAt: chatsTable.lastActivityAt,
            lastMessage: {
                authorAgentDisplayName: lastMessage.authorAgentDisplayName,
                authorAgentId: lastMessage.authorAgentId,
                authorUserDisplayName: lastMessage.authorUserDisplayName,
                authorUserId: lastMessage.authorUserId,
                content: lastMessage.content,
                createdAt: lastMessage.createdAt,
            },
            lastMessageSequence: chatsTable.lastMessageSequence,
            parentChatId: chatsTable.parentChatId,
            serverId: chatsTable.serverId,
            threadChatId: chatsTable.id,
            unreadCount: threadUnreadCount(member.id),
        })
        .from(chatsTable)
        .leftJoinLateral(lastMessage, sql`true`)
        .where(and(eq(chatsTable.serverId, serverId), unreadThreads(member.id)))
        .orderBy(sql`${chatsTable.lastActivityAt} desc nulls last`, chatsTable.id);

    return rows.map(toUnreadThread);
}

type UnreadThreadRow = Omit<
    UnreadThread,
    | 'anchorMessageId'
    | 'firstUnreadMessageId'
    | 'firstUnreadSequence'
    | 'lastActivityAt'
    | 'latestReply'
    | 'parentChatId'
> & {
    anchorMessageId: string | null;
    firstUnreadMessageId: string | null;
    firstUnreadSequence: number | null;
    lastActivityAt: Date | null;
    lastMessage: Parameters<typeof toChatLastMessage>[0];
    parentChatId: string | null;
};

/** A Thread row missing its anchor, parent, or first unread reply is corrupt; fail rather than invent. */
function toUnreadThread({ lastMessage, ...row }: UnreadThreadRow): UnreadThread {
    const { anchorMessageId, firstUnreadMessageId, firstUnreadSequence, parentChatId } = row;
    if (
        anchorMessageId === null ||
        parentChatId === null ||
        firstUnreadMessageId === null ||
        firstUnreadSequence === null
    ) {
        throw new Error(
            `Unread Thread ${row.threadChatId} is missing its anchor, parent, or first unread reply.`
        );
    }
    return {
        ...row,
        anchorMessageId,
        firstUnreadMessageId,
        firstUnreadSequence,
        lastActivityAt: row.lastActivityAt?.toISOString() ?? null,
        latestReply: toChatLastMessage(lastMessage),
        parentChatId,
    };
}
