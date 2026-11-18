import { type ChatUnreadPreview, type Task, unreadPreviewMessageLimit } from '@haus/api';
import { and, eq, inArray, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import { chatsTable, tasksTable } from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { readTasks } from '../tasks/task-read.ts';
import { taskNewestCountedMessageIds, taskUnreadCount, unreadTasks } from '../tasks/task-unread.ts';
import type { HausUser } from '../users/haus-user.ts';
import { chatNewestUnreadMessageIds, chatUnreadCount, listedChats } from './chat-unread.ts';
import { readMessagesById } from './read-messages-by-id.ts';

/**
 * The waiting messages behind every unread Inbox row, in one read: each
 * unread Channel or DM (`listedChats` with an `unreadCount`) and each followed
 * unread Task (`unreadTasks`, ADR 0052), with its newest counted messages
 * projected the way the transcript projects them. The row predicates are the
 * ones `chat.list` and the badge use, so a preview exists for exactly the rows
 * the Inbox shows.
 */
export async function listUnreadPreviews(
    db: HausDatabase,
    member: Pick<HausUser, 'id'> | null,
    serverId: string
): Promise<ChatUnreadPreview[]> {
    await requireServerMembership(db, member, serverId);

    if (!member) {
        return [];
    }

    const limit = unreadPreviewMessageLimit;
    const rows = await db
        .select({
            chatId: chatsTable.id,
            kind: chatsTable.kind,
            messageIds: sql<string[]>`case when ${chatsTable.kind} = 'task'
                then ${taskNewestCountedMessageIds(member.id, limit)}
                else ${chatNewestUnreadMessageIds(member.id, limit)} end`,
            unreadCount: sql<number>`case when ${chatsTable.kind} = 'task'
                then ${taskUnreadCount(member.id)}
                else ${chatUnreadCount(member.id)} end`,
        })
        .from(chatsTable)
        .where(
            and(
                eq(chatsTable.serverId, serverId),
                or(
                    sql`(${listedChats(member.id, 'active')} and ${chatUnreadCount(member.id)} > 0)`,
                    unreadTasks(member.id)
                )
            )
        )
        .orderBy(sql`${chatsTable.lastActivityAt} desc nulls last`, chatsTable.id);

    const messages = await readMessagesById(
        db,
        serverId,
        rows.flatMap((row) => row.messageIds)
    );
    const taskChatIds = rows.flatMap((row) => (row.kind === 'task' ? [row.chatId] : []));
    const tasks =
        taskChatIds.length === 0
            ? []
            : await readTasks(db, { serverId, where: inArray(tasksTable.chatId, taskChatIds) });
    const taskByChat = new Map(tasks.map((task) => [task.chatId, task]));

    return rows.map((row) => toUnreadPreview(row, messages, taskByChat));
}

/** A counted id that no longer projects is a corrupt row; fail rather than show a gap. */
function toUnreadPreview(
    row: {
        chatId: string;
        kind: string;
        messageIds: string[];
        unreadCount: number;
    },
    messages: Map<string, ChatUnreadPreview['messages'][number]>,
    taskByChat: Map<string | null, Task>
): ChatUnreadPreview {
    const projected = [...row.messageIds].reverse().map((id) => {
        const message = messages.get(id);
        if (!message) {
            throw new Error(`Unread message ${id} in Chat ${row.chatId} did not project.`);
        }
        return message;
    });
    return {
        chatId: row.chatId,
        earlierUnreadCount: Math.max(0, row.unreadCount - projected.length),
        messages: projected,
        task: row.kind === 'task' ? toPreviewTask(row.chatId, taskByChat.get(row.chatId)) : null,
    };
}

function toPreviewTask(chatId: string, task: Task | undefined): ChatUnreadPreview['task'] {
    if (!task?.origin) {
        throw new Error(`Task Chat ${chatId} has no Task with an origin.`);
    }
    return {
        key: task.key,
        originChatId: task.origin.chatId,
        state: task.state,
        taskId: task.id,
        title: task.title,
    };
}
