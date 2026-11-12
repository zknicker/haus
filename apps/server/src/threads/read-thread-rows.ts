import {
    type CloudAgentWork,
    deriveOpenThreadState,
    isOpenThreadExpired,
    type OpenThread,
    threadTitle,
} from '@haus/api';
import { and, asc, eq, inArray, or, sql } from 'drizzle-orm';
import { chatLastMessageLateral, toChatLastMessage } from '../chats/chat-last-message.ts';
import { listedChats } from '../chats/chat-unread.ts';
import { readWorkDetails, toCloudAgentWork } from '../cloud-agents/cloud-agent-shape.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    chatsTable,
    cloudAgentWorkLinksTable,
    cloudAgentWorkTable,
    threadClosuresTable,
    threadFollowsTable,
} from '../postgres/schema.ts';
import { threadUnreadCount } from './thread-unread.ts';

export type ThreadRowScope = 'candidates' | 'all';

export interface ThreadRow {
    closed: boolean;
    open: boolean;
    thread: OpenThread;
}

/**
 * Every Thread in `scope` for `userId`, read in a fixed number of queries and
 * run through `deriveOpenThreadState`. `candidates` is the Open Threads rule:
 * followed, or holding Cloud Agent work and not explicitly unfollowed. Newest
 * activity first.
 */
export async function readThreadRows(
    db: HausDatabase,
    userId: string,
    serverId: string,
    scope: ThreadRowScope,
    now: Date
): Promise<ThreadRow[]> {
    const lastMessage = chatLastMessageLateral(db);
    const rows = await db
        .select({
            anchorContent: sql<string | null>`(
                select anchor.content from chat_messages anchor
                where anchor.server_id = ${chatsTable.serverId}
                    and anchor.id = ${chatsTable.anchorMessageId}
            )`,
            anchorMessageId: chatsTable.anchorMessageId,
            closedThroughSequence: threadClosuresTable.closedThroughSequence,
            lastActivityAt: chatsTable.lastActivityAt,
            lastMessage: {
                authorAgentDisplayName: lastMessage.authorAgentDisplayName,
                authorAgentId: lastMessage.authorAgentId,
                authorUserDisplayName: lastMessage.authorUserDisplayName,
                authorUserId: lastMessage.authorUserId,
                content: lastMessage.content,
                createdAt: lastMessage.createdAt,
            },
            mentionsViewer: sql<boolean>`exists (
                select 1 from chat_messages reply
                left join chat_reads thread_read
                    on thread_read.server_id = reply.server_id
                    and thread_read.chat_id = reply.chat_id
                    and thread_read.reader_user_id = ${userId}
                where reply.server_id = ${chatsTable.serverId}
                    and reply.chat_id = ${chatsTable.id}
                    and reply.sequence > coalesce(thread_read.sequence, 0)
                    and reply.mentioned_user_ids @> array[${userId}]::text[]
            )`,
            newestOtherSequence: sql<number>`coalesce((
                select max(reply.sequence) from chat_messages reply
                where reply.server_id = ${chatsTable.serverId}
                    and reply.chat_id = ${chatsTable.id}
                    and (reply.author_user_id is null or reply.author_user_id <> ${userId})
            ), 0)`,
            parentChatId: chatsTable.parentChatId,
            threadChatId: chatsTable.id,
            unreadCount: threadUnreadCount(userId),
            viewerTookPart: sql<boolean>`exists (
                select 1 from chat_messages part
                where part.server_id = ${chatsTable.serverId}
                    and (part.chat_id = ${chatsTable.id} or part.id = ${chatsTable.anchorMessageId})
                    and (
                        part.author_user_id = ${userId}
                        or part.mentioned_user_ids @> array[${userId}]::text[]
                    )
            )`,
        })
        .from(chatsTable)
        .leftJoin(
            threadFollowsTable,
            and(
                eq(threadFollowsTable.serverId, chatsTable.serverId),
                eq(threadFollowsTable.threadChatId, chatsTable.id),
                eq(threadFollowsTable.userId, userId)
            )
        )
        .leftJoin(
            threadClosuresTable,
            and(
                eq(threadClosuresTable.serverId, chatsTable.serverId),
                eq(threadClosuresTable.threadChatId, chatsTable.id),
                eq(threadClosuresTable.userId, userId)
            )
        )
        .leftJoinLateral(lastMessage, sql`true`)
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                sql`${chatsTable.kind} = 'thread'`,
                sql`${chatsTable.deletedAt} is null`,
                sql`(${chatsTable.serverId}, ${chatsTable.parentChatId}) in (
                    select "chats"."server_id", "chats"."id"
                    from "chats"
                    where ${listedChats(userId, 'active')}
                )`,
                scope === 'candidates' ? candidateThread() : undefined
            )
        )
        .orderBy(sql`${chatsTable.lastActivityAt} desc nulls last`, chatsTable.id);

    const worksByThread = await readThreadWorks(db, serverId, rows);

    return rows.map((row) => {
        const { anchorMessageId, parentChatId } = row;
        if (anchorMessageId === null || parentChatId === null) {
            throw new Error(`Thread ${row.threadChatId} is missing its anchor or parent.`);
        }
        const works = worksByThread.get(row.threadChatId) ?? [];
        const lastActivityAt = row.lastActivityAt?.toISOString() ?? null;
        const reading = deriveOpenThreadState(
            {
                lastActivityAt,
                unreadCount: row.unreadCount,
                viewerTookPart: row.viewerTookPart,
                works,
            },
            now
        );
        const thread: OpenThread = {
            ...reading,
            actorName: toChatLastMessage(row.lastMessage)?.authorDisplayName ?? null,
            anchorMessageId,
            jobCount: works.length,
            lastActivityAt,
            liveJobCount: works.filter((work) => work.job.state === 'working').length,
            mentionsViewer: row.mentionsViewer,
            parentChatId,
            threadChatId: row.threadChatId,
            title: threadTitle({
                anchorContent: row.anchorContent,
                oldestWorkTitle: works[0]?.title ?? null,
            }),
            unreadCount: row.unreadCount,
            updatedAt: newestUpdate(works),
            viewerTookPart: row.viewerTookPart,
        };
        const closed =
            row.closedThroughSequence !== null &&
            row.newestOtherSequence <= row.closedThroughSequence;
        return { closed, open: !(closed || isOpenThreadExpired(thread, now)), thread };
    });
}

/** Followed, or holding work the viewer has not walked away from. */
function candidateThread() {
    return or(
        sql`${threadFollowsTable.followed} is true`,
        and(
            sql`${threadFollowsTable.followed} is not false`,
            sql`(
                exists (
                    select 1 from cloud_agent_work_links link
                    where link.server_id = ${chatsTable.serverId}
                        and (
                            link.chat_id = ${chatsTable.id}
                            or link.message_id = ${chatsTable.anchorMessageId}
                        )
                )
            )`
        )
    );
}

/** Each Thread's work, oldest first: linked from its anchor or from a Message inside it. */
async function readThreadWorks(
    db: HausDatabase,
    serverId: string,
    threads: Array<{ anchorMessageId: string | null; threadChatId: string }>
) {
    const byThread = new Map<string, CloudAgentWork[]>();
    if (threads.length === 0) {
        return byThread;
    }
    const threadByAnchor = new Map(
        threads.map((thread) => [thread.anchorMessageId, thread.threadChatId])
    );
    const anchors = threads.flatMap((thread) => thread.anchorMessageId ?? []);
    const threadIds = new Set(threads.map((thread) => thread.threadChatId));
    const rows = await db
        .select({
            chatId: cloudAgentWorkLinksTable.chatId,
            messageId: cloudAgentWorkLinksTable.messageId,
            work: cloudAgentWorkTable,
        })
        .from(cloudAgentWorkLinksTable)
        .innerJoin(
            cloudAgentWorkTable,
            and(
                eq(cloudAgentWorkTable.serverId, cloudAgentWorkLinksTable.serverId),
                eq(cloudAgentWorkTable.id, cloudAgentWorkLinksTable.workId)
            )
        )
        .where(
            and(
                eq(cloudAgentWorkLinksTable.serverId, serverId),
                or(
                    inArray(cloudAgentWorkLinksTable.chatId, [...threadIds]),
                    inArray(cloudAgentWorkLinksTable.messageId, anchors)
                )
            )
        )
        .orderBy(asc(cloudAgentWorkTable.createdAt));
    const details = await readWorkDetails(db, serverId, [
        ...new Set(rows.map(({ work }) => work.id)),
    ]);
    for (const { chatId, messageId, work } of rows) {
        const threadChatId = threadIds.has(chatId) ? chatId : threadByAnchor.get(messageId);
        const works = (threadChatId && byThread.get(threadChatId)) || [];
        if (threadChatId && !works.some((existing) => existing.id === work.id)) {
            byThread.set(threadChatId, [...works, toCloudAgentWork(work, details.get(work.id))]);
        }
    }
    return byThread;
}

function newestUpdate(works: CloudAgentWork[]): string | null {
    const live = works.filter((work) => work.job.state === 'working');
    const dates = live.map((work) => work.activity?.at ?? work.updatedAt);
    return dates.sort().at(-1) ?? null;
}
