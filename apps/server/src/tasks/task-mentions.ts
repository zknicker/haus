import type { TaskMention, TaskReminderRef } from '@haus/api';
import { and, desc, eq, isNull, max } from 'drizzle-orm';
import { readStoredAuthorIdentity } from '../chats/message-shape.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatMessagesTable,
    chatsTable,
    remindersTable,
    taskMessageLinksTable,
    taskReminderLinksTable,
    usersTable,
} from '../postgres/schema.ts';
import { actorVisibleChats } from './actor-visible-chats.ts';
import type { TaskActor } from './task-actor.ts';

type Reader = Pick<HausDatabase, 'select'>;

const mentionLimit = 50;
const excerptMaxChars = 280;

/**
 * A Task's **Mentioned in**: the messages that reference it, newest first, one
 * row per message, limited to Chats the reader can read. The Task is visible
 * to every member; a DM that mentions it is not.
 */
export async function listTaskMentions(
    db: Reader,
    reader: TaskActor,
    input: { serverId: string; taskId: string }
): Promise<TaskMention[]> {
    const linked = db
        .select({
            messageId: taskMessageLinksTable.messageId,
            linkedAt: max(taskMessageLinksTable.createdAt).as('linked_at'),
        })
        .from(taskMessageLinksTable)
        .where(
            and(
                eq(taskMessageLinksTable.serverId, input.serverId),
                eq(taskMessageLinksTable.taskId, input.taskId)
            )
        )
        .groupBy(taskMessageLinksTable.messageId)
        .as('linked');
    const rows = await db
        .select({
            anchorMessageId: chatsTable.anchorMessageId,
            authorAgentDisplayName: agentsTable.displayName,
            authorAgentId: chatMessagesTable.authorAgentId,
            authorUserDisplayName: usersTable.displayName,
            authorUserId: chatMessagesTable.authorUserId,
            chatId: chatMessagesTable.chatId,
            chatKind: chatsTable.kind,
            content: chatMessagesTable.content,
            createdAt: chatMessagesTable.createdAt,
            messageId: chatMessagesTable.id,
        })
        .from(linked)
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, input.serverId),
                eq(chatMessagesTable.id, linked.messageId)
            )
        )
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, chatMessagesTable.serverId),
                eq(chatsTable.id, chatMessagesTable.chatId)
            )
        )
        .leftJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, chatMessagesTable.serverId),
                eq(agentsTable.id, chatMessagesTable.authorAgentId)
            )
        )
        .leftJoin(usersTable, eq(usersTable.id, chatMessagesTable.authorUserId))
        .where(and(isNull(chatsTable.deletedAt), actorVisibleChats(reader)))
        .orderBy(desc(chatMessagesTable.createdAt), desc(chatMessagesTable.id))
        .limit(mentionLimit);
    return rows.map((row) => ({
        authorLabel: readStoredAuthorIdentity(row)?.displayName ?? 'Unknown',
        chatId: row.chatId,
        createdAt: row.createdAt.toISOString(),
        excerpt: excerptOf(row.content),
        messageId: row.messageId,
        threadAnchorMessageId: row.chatKind === 'thread' ? row.anchorMessageId : null,
    }));
}

/**
 * A Task's **Reminders**: Reminders whose description references it, soonest
 * first, limited to those anchored in Chats the reader can read. The Task is
 * visible to every member; a Reminder anchored in a DM is not.
 */
export async function listTaskReminders(
    db: Reader,
    reader: TaskActor,
    input: { serverId: string; taskId: string }
): Promise<TaskReminderRef[]> {
    const rows = await db
        .select({
            anchorChatId: remindersTable.anchorChatId,
            fireAt: remindersTable.fireAt,
            repeat: remindersTable.repeat,
            reminderId: remindersTable.id,
            status: remindersTable.status,
            title: remindersTable.title,
        })
        .from(taskReminderLinksTable)
        .innerJoin(
            remindersTable,
            and(
                eq(remindersTable.serverId, taskReminderLinksTable.serverId),
                eq(remindersTable.id, taskReminderLinksTable.reminderId)
            )
        )
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, remindersTable.serverId),
                eq(chatsTable.id, remindersTable.anchorChatId)
            )
        )
        .where(
            and(
                eq(taskReminderLinksTable.serverId, input.serverId),
                eq(taskReminderLinksTable.taskId, input.taskId),
                isNull(chatsTable.deletedAt),
                actorVisibleChats(reader)
            )
        )
        .orderBy(remindersTable.fireAt, remindersTable.id);
    return rows.map((row) => ({
        anchorChatId: row.anchorChatId,
        kind: row.repeat === null ? 'once' : 'recurring',
        nextFireAt: row.status === 'scheduled' ? row.fireAt.toISOString() : null,
        reminderId: row.reminderId,
        title: row.title,
    }));
}

function excerptOf(content: string): string {
    const collapsed = content.replaceAll(/\s+/gu, ' ').trim();
    return collapsed.length > excerptMaxChars
        ? `${collapsed.slice(0, excerptMaxChars - 1)}…`
        : collapsed;
}
