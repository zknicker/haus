import type { TaskMention, TaskReminderRef } from '@haus/api';
import { and, desc, eq, exists, isNull, max, or } from 'drizzle-orm';
import { readStoredAuthorIdentity } from '../chats/message-shape.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatMessagesTable,
    chatsTable,
    remindersTable,
    taskMessageLinksTable,
    taskReminderLinksTable,
    tasksTable,
    usersTable,
} from '../postgres/schema.ts';
import { actorVisibleChats } from './actor-visible-chats.ts';
import type { TaskActor } from './task-actor.ts';
import { messagePlaceColumns, messagePlaceOf, originChannelJoin } from './task-message-place.ts';

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
            ...messagePlaceColumns,
            authorAgentDisplayName: agentsTable.displayName,
            authorAgentId: chatMessagesTable.authorAgentId,
            authorUserDisplayName: usersTable.displayName,
            authorUserId: chatMessagesTable.authorUserId,
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
        .leftJoin(...originChannelJoin)
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
        place: messagePlaceOf(row),
    }));
}

/**
 * A Task's **Reminders**: Reminders set on the Task (anchored in its own Chat,
 * ADR 0052 decision 16) and Reminders whose description references it, soonest
 * first, each naming the Agent that set it, limited to those anchored in Chats
 * the reader can read. The Task is visible to every member; a Reminder
 * anchored in a DM is not.
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
            ownerAgentId: remindersTable.ownerAgentId,
            ownerDisplayName: agentsTable.displayName,
            repeat: remindersTable.repeat,
            reminderId: remindersTable.id,
            status: remindersTable.status,
            title: remindersTable.title,
        })
        .from(remindersTable)
        .innerJoin(
            chatsTable,
            and(
                eq(chatsTable.serverId, remindersTable.serverId),
                eq(chatsTable.id, remindersTable.anchorChatId)
            )
        )
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, remindersTable.serverId),
                eq(agentsTable.id, remindersTable.ownerAgentId)
            )
        )
        .where(
            and(
                eq(remindersTable.serverId, input.serverId),
                or(
                    exists(
                        db
                            .select({ reminderId: taskReminderLinksTable.reminderId })
                            .from(taskReminderLinksTable)
                            .where(
                                and(
                                    eq(taskReminderLinksTable.serverId, remindersTable.serverId),
                                    eq(taskReminderLinksTable.reminderId, remindersTable.id),
                                    eq(taskReminderLinksTable.taskId, input.taskId)
                                )
                            )
                    ),
                    exists(
                        db
                            .select({ id: tasksTable.id })
                            .from(tasksTable)
                            .where(
                                and(
                                    eq(tasksTable.serverId, remindersTable.serverId),
                                    eq(tasksTable.id, input.taskId),
                                    eq(tasksTable.chatId, remindersTable.anchorChatId)
                                )
                            )
                    )
                ),
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
        setBy: { agentId: row.ownerAgentId, displayName: row.ownerDisplayName },
        title: row.title,
    }));
}

function excerptOf(content: string): string {
    const collapsed = content.replaceAll(/\s+/gu, ' ').trim();
    return collapsed.length > excerptMaxChars
        ? `${collapsed.slice(0, excerptMaxChars - 1)}…`
        : collapsed;
}
