import type { ReminderHistoryEntry } from '@haus/api';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    chatMessagesTable,
    messageCausesTable,
    reminderFiresTable,
    remindersTable,
} from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireReminderOperator } from './operator-reminders.ts';

/**
 * History is the Agent's fire log, not a list of settled reminders: one entry
 * per `reminder_fires` row, so a recurring reminder contributes an entry every
 * time it wakes. The fire row carries what happened — including whether that
 * wake ran a script — while the reminder row carries how it is described now,
 * so title and cadence are read live and the script outcome is not.
 *
 * The answer comes from a lateral join, not a plain one: `message_causes` keys
 * on the message, so nothing stops an Agent attributing two messages to one
 * fire, and a flat join would split that fire into two entries and spend two
 * of the caller's rows on it. The lateral picks the earliest answer and keeps
 * the entry count equal to the fire count. The message row is the only place
 * its Chat is recorded — an explicitly attributed answer can land outside the
 * reminder's anchor Chat, so reading `chat_messages.chat_id` is correct where
 * reading the anchor would not be.
 */
export async function listOperatorReminderHistory(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; limit: number; serverId: string }
): Promise<ReminderHistoryEntry[]> {
    await requireReminderOperator(db, member, input.serverId);
    const earliestAnswer = db
        .select({
            chatId: chatMessagesTable.chatId,
            messageId: chatMessagesTable.id,
        })
        .from(messageCausesTable)
        .innerJoin(
            chatMessagesTable,
            and(
                eq(chatMessagesTable.serverId, messageCausesTable.serverId),
                eq(chatMessagesTable.id, messageCausesTable.messageId)
            )
        )
        .where(
            and(
                eq(messageCausesTable.serverId, reminderFiresTable.serverId),
                eq(messageCausesTable.reminderFireId, reminderFiresTable.id)
            )
        )
        .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.id))
        .limit(1)
        .as('earliest_answer');
    const rows = await db
        .select({
            answerChatId: earliestAnswer.chatId,
            answerMessageId: earliestAnswer.messageId,
            durationMs: reminderFiresTable.durationMs,
            fireId: reminderFiresTable.id,
            firedAt: reminderFiresTable.firedAt,
            hasScript: reminderFiresTable.hasScript,
            outcome: reminderFiresTable.outcome,
            reminderId: reminderFiresTable.reminderId,
            repeat: remindersTable.repeat,
            scheduledFor: reminderFiresTable.scheduledFor,
            scriptExitCode: reminderFiresTable.scriptExitCode,
            scriptTimedOut: reminderFiresTable.scriptTimedOut,
            title: remindersTable.title,
        })
        .from(reminderFiresTable)
        .innerJoin(
            remindersTable,
            and(
                eq(remindersTable.serverId, reminderFiresTable.serverId),
                eq(remindersTable.id, reminderFiresTable.reminderId)
            )
        )
        .leftJoinLateral(earliestAnswer, sql`true`)
        .where(
            and(
                eq(reminderFiresTable.serverId, input.serverId),
                eq(remindersTable.ownerAgentId, input.agentId)
            )
        )
        .orderBy(desc(reminderFiresTable.firedAt), desc(reminderFiresTable.id))
        .limit(input.limit);
    return rows.map((row) => ({
        answer:
            row.answerMessageId && row.answerChatId
                ? { chatId: row.answerChatId, messageId: row.answerMessageId }
                : null,
        fireId: row.fireId,
        firedAt: row.firedAt.toISOString(),
        reminderId: row.reminderId,
        repeat: row.repeat,
        scheduledFor: row.scheduledFor.toISOString(),
        script: row.hasScript
            ? {
                  durationMs: row.durationMs,
                  exitCode: row.scriptExitCode,
                  outcome: row.outcome,
                  timedOut: row.scriptTimedOut,
              }
            : null,
        title: row.title,
    }));
}
