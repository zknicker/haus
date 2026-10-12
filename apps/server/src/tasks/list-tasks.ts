import type { TaskList, TaskListItem, ThreadSummary } from '@haus/api';
import { and, desc, eq, sql } from 'drizzle-orm';
import { visibleChats } from '../chats/chat-visibility.ts';
import { readMessageBodies } from '../chats/message-bodies.ts';
import { readChatMessageReactions } from '../chats/message-reactions.ts';
import { toChatMessage } from '../chats/message-shape.ts';
import { readLinkedCloudAgentWork } from '../cloud-agents/linked-cloud-agent-work.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, messageTasksTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { listThreadSummaries } from '../threads/list-thread-summaries.ts';
import { threadChatIdForAnchor } from '../threads/thread-id.ts';
import type { HausUser } from '../users/haus-user.ts';
import { projectMessageTasks } from './task-shape.ts';

/**
 * The Board and List lens. Background claims are an Agent's own bookkeeping,
 * so they stay out of the default answer and are counted instead;
 * `includeBackground` widens the lens to everything.
 */
export async function listTasks(
    db: HausDatabase,
    member: HausUser | null,
    input: { chatId?: string; includeBackground: boolean; serverId: string }
): Promise<TaskList> {
    await requireServerMembership(db, member, input.serverId);
    if (!member) {
        return { backgroundCount: 0, tasks: [] };
    }
    const predicates = [eq(messageTasksTable.serverId, input.serverId), visibleChats(member.id)];
    if (input.chatId) {
        predicates.push(eq(messageTasksTable.chatId, input.chatId));
    }
    const rows = await db
        .select({
            chatKind: chatsTable.kind,
            chatName: chatsTable.name,
            chatPeerUserId: sql<string | null>`case
                when ${chatsTable.dmMemberOneUserId} = ${member.id}
                then ${chatsTable.dmMemberTwoUserId}
                else ${chatsTable.dmMemberOneUserId}
            end`,
            message: chatMessagesTable,
            task: messageTasksTable,
        })
        .from(messageTasksTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, messageTasksTable.serverId),
                eq(chatsTable.id, messageTasksTable.chatId)
            )
        )
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, messageTasksTable.serverId),
                eq(chatMessagesTable.id, messageTasksTable.messageId)
            )
        )
        .where(and(...predicates))
        .orderBy(desc(messageTasksTable.updatedAt));

    const visible = rows.filter((row) => row.chatKind === 'channel' || row.chatKind === 'dm');
    const messageIds = visible.map((row) => row.task.messageId);
    const [projected, bodies, works, reactions, summaries] = await Promise.all([
        projectMessageTasks(
            db,
            input.serverId,
            visible.map((row) => row.task)
        ),
        readMessageBodies(db, input.serverId, messageIds),
        readLinkedCloudAgentWork(db, input.serverId, messageIds),
        readChatMessageReactions(db, input.serverId, messageIds),
        listThreadSummaries(db, member, {
            anchorMessageIds: messageIds,
            serverId: input.serverId,
        }),
    ]);
    const taskByMessageId = new Map(projected.map((task) => [task.messageId, task]));
    const summaryByMessageId = new Map(
        summaries.map((summary) => [summary.anchorMessageId, summary])
    );
    const tasks: TaskListItem[] = [];
    let backgroundCount = 0;
    for (const row of visible) {
        const task = taskByMessageId.get(row.task.messageId);
        if (!task) {
            continue;
        }
        if (task.tier === 'background' && !input.includeBackground) {
            backgroundCount += 1;
            continue;
        }
        tasks.push({
            chatKind: row.chatKind as 'channel' | 'dm',
            chatName: row.chatName,
            chatPeerUserId: row.chatPeerUserId,
            message: {
                ...toChatMessage(row.message, {
                    body: bodies.get(row.message.id),
                    cloudAgentWork: works.get(row.message.id),
                    reactions: reactions.get(row.message.id),
                }),
                task,
            },
            task,
            threadSummary:
                summaryByMessageId.get(row.task.messageId) ??
                emptyThreadSummary(row.task.messageId),
        });
    }
    return { backgroundCount, tasks };
}

/**
 * A task whose Thread nobody has replied in yet has no Thread row, and its work
 * surface reads as exactly that: no replies, nothing unread, nothing followed.
 */
function emptyThreadSummary(anchorMessageId: string): ThreadSummary {
    return {
        anchorMessageId,
        followed: false,
        latestReplyAt: null,
        recentReplies: [],
        replyCount: 0,
        threadChatId: threadChatIdForAnchor(anchorMessageId),
        unreadCount: 0,
    };
}
