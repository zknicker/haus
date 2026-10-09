import type { ThreadSummary } from '@haus/api';
import { and, eq, inArray } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    chatMessagesTable,
    chatReadsTable,
    chatsTable,
    cloudAgentWorkTable,
    threadFollowsTable,
} from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';

/**
 * How many conversational replies the anchor's preview block shows. Cloud Agent
 * work announcements are left out: the preview states that work once, as its
 * work summary, so a fan-out never crowds the conversation off the preview.
 */
const threadPreviewReplyCount = 3;

export async function listThreadSummaries(
    db: HausDatabase,
    member: HausUser | null,
    input: { anchorMessageIds: string[]; parentChatId?: string; serverId: string }
): Promise<ThreadSummary[]> {
    if (!(member && input.anchorMessageIds.length > 0)) {
        return [];
    }

    const threads = await db
        .select({
            anchorMessageId: chatsTable.anchorMessageId,
            id: chatsTable.id,
        })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, input.serverId),
                eq(chatsTable.kind, 'thread'),
                ...(input.parentChatId ? [eq(chatsTable.parentChatId, input.parentChatId)] : []),
                inArray(chatsTable.anchorMessageId, input.anchorMessageIds)
            )
        );
    const threadIds = threads.map((thread) => thread.id);

    if (threadIds.length === 0) {
        return [];
    }

    const [messages, reads, follows, workMessages] = await Promise.all([
        db
            .select({
                authorAgentId: chatMessagesTable.authorAgentId,
                authorUserId: chatMessagesTable.authorUserId,
                chatId: chatMessagesTable.chatId,
                content: chatMessagesTable.content,
                createdAt: chatMessagesTable.createdAt,
                id: chatMessagesTable.id,
                sequence: chatMessagesTable.sequence,
            })
            .from(chatMessagesTable)
            .where(
                and(
                    eq(chatMessagesTable.serverId, input.serverId),
                    inArray(chatMessagesTable.chatId, threadIds)
                )
            ),
        db
            .select({ chatId: chatReadsTable.chatId, sequence: chatReadsTable.sequence })
            .from(chatReadsTable)
            .where(
                and(
                    eq(chatReadsTable.serverId, input.serverId),
                    eq(chatReadsTable.readerUserId, member.id),
                    inArray(chatReadsTable.chatId, threadIds)
                )
            ),
        db
            .select({
                followed: threadFollowsTable.followed,
                threadChatId: threadFollowsTable.threadChatId,
            })
            .from(threadFollowsTable)
            .where(
                and(
                    eq(threadFollowsTable.serverId, input.serverId),
                    eq(threadFollowsTable.userId, member.id),
                    inArray(threadFollowsTable.threadChatId, threadIds)
                )
            ),
        db
            .select({ messageId: cloudAgentWorkTable.messageId })
            .from(cloudAgentWorkTable)
            .where(
                and(
                    eq(cloudAgentWorkTable.serverId, input.serverId),
                    inArray(cloudAgentWorkTable.chatId, threadIds)
                )
            ),
    ]);
    const workMessageIds = new Set(workMessages.map((work) => work.messageId));
    const readByThread = new Map(reads.map((read) => [read.chatId, read.sequence]));
    const followByThread = new Map(follows.map((follow) => [follow.threadChatId, follow.followed]));

    return threads.map((thread) => {
        const replies = messages
            .filter((message) => message.chatId === thread.id)
            .sort((left, right) => left.sequence - right.sequence);
        const readSequence = readByThread.get(thread.id) ?? 0;
        const latestReply = replies.reduce<Date | null>(
            (latest, reply) => (!latest || reply.createdAt > latest ? reply.createdAt : latest),
            null
        );

        return {
            anchorMessageId: thread.anchorMessageId as string,
            followed: followByThread.get(thread.id) ?? false,
            latestReplyAt: latestReply?.toISOString() ?? null,
            recentReplies: replies
                .filter((reply) => !workMessageIds.has(reply.id))
                .slice(-threadPreviewReplyCount)
                .map((reply) => ({
                    authorAgentId: reply.authorAgentId,
                    authorUserId: reply.authorUserId,
                    content: reply.content,
                    createdAt: reply.createdAt.toISOString(),
                    id: reply.id,
                })),
            replyCount: replies.length,
            threadChatId: thread.id,
            unreadCount: replies.filter(
                (reply) => reply.authorUserId !== member.id && reply.sequence > readSequence
            ).length,
        };
    });
}
