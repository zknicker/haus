import type { TriggerHistoryEntry } from '@haus/api';
import { and, asc, desc, eq, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    chatMessagesTable,
    messageCausesTable,
    triggerFiresTable,
    triggersTable,
} from '../postgres/schema.ts';
import type { HausUser } from '../users/haus-user.ts';
import { requireTriggerOperator } from './operator-triggers.ts';

/**
 * Agent-wide Trigger fire history: one row per retained fire, including fires
 * whose Trigger was removed. The answer uses the first cause-linked message,
 * matching Reminder history and keeping one table row per fire.
 */
export async function listOperatorTriggerHistory(
    db: HausDatabase,
    member: HausUser | null,
    input: { agentId: string; limit: number; serverId: string }
): Promise<TriggerHistoryEntry[]> {
    await requireTriggerOperator(db, member, input.serverId);
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
                eq(messageCausesTable.serverId, triggerFiresTable.serverId),
                eq(messageCausesTable.triggerFireId, triggerFiresTable.id)
            )
        )
        .orderBy(asc(chatMessagesTable.createdAt), asc(chatMessagesTable.id))
        .limit(1)
        .as('earliest_trigger_answer');
    const rows = await db
        .select({
            answerChatId: earliestAnswer.chatId,
            answerMessageId: earliestAnswer.messageId,
            contentType: triggerFiresTable.contentType,
            dedupeKey: triggerFiresTable.dedupeKey,
            fireId: triggerFiresTable.id,
            firedAt: triggerFiresTable.receivedAt,
            payloadBytes: triggerFiresTable.payloadBytes,
            title: triggersTable.title,
            triggerDeletedAt: triggersTable.deletedAt,
            triggerId: triggersTable.id,
        })
        .from(triggerFiresTable)
        .innerJoin(
            triggersTable,
            and(
                eq(triggersTable.serverId, triggerFiresTable.serverId),
                eq(triggersTable.id, triggerFiresTable.triggerId)
            )
        )
        .leftJoinLateral(earliestAnswer, sql`true`)
        .where(
            and(
                eq(triggerFiresTable.serverId, input.serverId),
                eq(triggersTable.ownerAgentId, input.agentId)
            )
        )
        .orderBy(desc(triggerFiresTable.receivedAt), desc(triggerFiresTable.id))
        .limit(input.limit);
    return rows.map((row) => ({
        answer:
            row.answerMessageId && row.answerChatId
                ? { chatId: row.answerChatId, messageId: row.answerMessageId }
                : null,
        contentType: row.contentType,
        dedupeKey: row.dedupeKey,
        fireId: row.fireId,
        firedAt: row.firedAt.toISOString(),
        payloadBytes: row.payloadBytes,
        title: row.title,
        triggerDeletedAt: row.triggerDeletedAt?.toISOString() ?? null,
        triggerId: row.triggerId,
    }));
}
