import { type TaskPreview, taskPreviewRecentMessageLimit } from '@haus/api';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatMessagesTable, chatsTable, taskFollowsTable, tasksTable } from '../postgres/schema.ts';
import { readTasks } from './task-read.ts';
import { taskUnreadCount } from './task-unread.ts';

type Reader = Pick<HausDatabase, 'select'>;

export async function listTaskPreviews(
    db: Reader,
    viewerUserId: string,
    input: { chatId: string; originMessageIds: string[]; serverId: string }
): Promise<TaskPreview[]> {
    if (input.originMessageIds.length === 0) {
        return [];
    }
    const chats = await db
        .select({
            chatId: chatsTable.id,
            followed: sql<boolean>`coalesce(${taskFollowsTable.followed}, false)`,
            messageCount: sql<number>`(
                select count(*)::integer from chat_messages message
                where message.server_id = ${chatsTable.serverId}
                    and message.chat_id = ${chatsTable.id}
            )`,
            unreadCount: taskUnreadCount(viewerUserId),
        })
        .from(tasksTable)
        .innerJoin(
            chatsTable,
            and(eq(chatsTable.serverId, tasksTable.serverId), eq(chatsTable.id, tasksTable.chatId))
        )
        .leftJoin(
            taskFollowsTable,
            and(
                eq(taskFollowsTable.serverId, chatsTable.serverId),
                eq(taskFollowsTable.taskChatId, chatsTable.id),
                eq(taskFollowsTable.userId, viewerUserId)
            )
        )
        .where(
            and(
                eq(tasksTable.serverId, input.serverId),
                eq(tasksTable.originChatId, input.chatId),
                inArray(tasksTable.originMessageId, input.originMessageIds),
                isNull(chatsTable.deletedAt)
            )
        );
    if (chats.length === 0) {
        return [];
    }
    const byChat = new Map(chats.map((chat) => [chat.chatId, chat]));
    const tasks = await readTasks(db, {
        serverId: input.serverId,
        where: inArray(
            tasksTable.chatId,
            chats.map((chat) => chat.chatId)
        ),
    });
    const previews: TaskPreview[] = [];
    for (const task of tasks) {
        const chat = task.chatId ? byChat.get(task.chatId) : undefined;
        if (!(chat && task.origin)) {
            continue;
        }
        previews.push({
            agentId: task.agentId,
            archivedAt: task.archivedAt,
            chatId: chat.chatId,
            followed: chat.followed,
            messageCount: chat.messageCount,
            model: task.model,
            originMessageId: task.origin.messageId,
            recentMessages: await readRecentMessages(db, input.serverId, chat.chatId),
            shortId: task.shortId,
            taskId: task.id,
            title: task.title,
            unreadCount: chat.followed ? chat.unreadCount : 0,
        });
    }
    return previews;
}

async function readRecentMessages(db: Reader, serverId: string, chatId: string) {
    const rows = await db
        .select({
            authorAgentId: chatMessagesTable.authorAgentId,
            authorUserId: chatMessagesTable.authorUserId,
            content: chatMessagesTable.content,
            createdAt: chatMessagesTable.createdAt,
            id: chatMessagesTable.id,
        })
        .from(chatMessagesTable)
        .where(and(eq(chatMessagesTable.serverId, serverId), eq(chatMessagesTable.chatId, chatId)))
        .orderBy(desc(chatMessagesTable.sequence))
        .limit(taskPreviewRecentMessageLimit);
    return rows.reverse().map((row) => ({ ...row, createdAt: row.createdAt.toISOString() }));
}
