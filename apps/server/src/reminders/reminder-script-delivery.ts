import type { ReminderScriptCommand, ReminderScriptResult } from '@haus/api';
import { and, asc, eq, isNull, or, sql } from 'drizzle-orm';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    agentsTable,
    chatsTable,
    reminderAgentAttentionTable,
    reminderFiresTable,
    remindersTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { reminderEnvelope } from './reminder-envelope.ts';
import { decideReminderWake } from './reminder-wake-decision.ts';

export async function listReminderScriptCommands(
    db: HausDatabase,
    computerId: string
): Promise<ReminderScriptCommand[]> {
    const rows = await db
        .select({
            agentId: reminderAgentAttentionTable.agentId,
            attentionId: reminderAgentAttentionTable.id,
            fireId: reminderAgentAttentionTable.fireId,
            reminderId: reminderAgentAttentionTable.reminderId,
            script: reminderAgentAttentionTable.script,
        })
        .from(reminderAgentAttentionTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, reminderAgentAttentionTable.serverId),
                eq(agentsTable.id, reminderAgentAttentionTable.agentId),
                eq(agentsTable.computerId, computerId)
            )
        )
        .where(eq(reminderAgentAttentionTable.kind, 'reminder_script'))
        .orderBy(asc(reminderAgentAttentionTable.queuedAt), asc(reminderAgentAttentionTable.id));
    return rows.flatMap((row) =>
        row.script
            ? [
                  {
                      agentId: row.agentId,
                      attentionId: row.attentionId,
                      fireId: row.fireId,
                      reminderId: row.reminderId,
                      script: row.script,
                      type: 'reminder-script' as const,
                  },
              ]
            : []
    );
}

export async function settleReminderScript(
    db: HausDatabase,
    computerId: string,
    result: ReminderScriptResult,
    enqueue: (
        tx: HausDatabase,
        input: {
            agentId: string;
            chatId: string;
            content: string;
            createdAt: Date;
            dedupeKey: string;
            serverId: string;
            source: string;
        }
    ) => Promise<void>
) {
    const [identity] = await db
        .select({
            computerId: agentsTable.computerId,
            serverId: reminderAgentAttentionTable.serverId,
        })
        .from(reminderAgentAttentionTable)
        .innerJoin(
            agentsTable,
            and(
                eq(agentsTable.serverId, reminderAgentAttentionTable.serverId),
                eq(agentsTable.id, reminderAgentAttentionTable.agentId)
            )
        )
        .where(
            and(
                eq(reminderAgentAttentionTable.id, result.attentionId),
                eq(reminderAgentAttentionTable.agentId, result.agentId),
                eq(reminderAgentAttentionTable.fireId, result.fireId)
            )
        )
        .limit(1);
    if (!identity || identity.computerId !== computerId) {
        return;
    }
    await db.transaction(async (tx) => {
        await lockServerRow(tx, identity.serverId);
        const [attention] = await tx
            .select()
            .from(reminderAgentAttentionTable)
            .where(
                and(
                    eq(reminderAgentAttentionTable.serverId, identity.serverId),
                    eq(reminderAgentAttentionTable.id, result.attentionId),
                    eq(reminderAgentAttentionTable.agentId, result.agentId),
                    eq(reminderAgentAttentionTable.fireId, result.fireId)
                )
            )
            .for('update');
        if (!attention) {
            return null;
        }
        const [reminder] = await tx
            .select({
                consecutiveFailures: remindersTable.consecutiveFailures,
                description: remindersTable.description,
                failAfter: remindersTable.failAfter,
                fireAt: remindersTable.fireAt,
                lastWakeOutputHash: remindersTable.lastWakeOutputHash,
                status: remindersTable.status,
                title: remindersTable.title,
                wakeOnChange: remindersTable.wakeOnChange,
            })
            .from(remindersTable)
            .where(
                and(
                    eq(remindersTable.serverId, identity.serverId),
                    eq(remindersTable.id, attention.reminderId)
                )
            )
            .limit(1)
            .for('update');
        if (!reminder) {
            return null;
        }

        const script = {
            exitCode: result.exitCode,
            output: result.output,
            timedOut: result.timedOut,
        };
        const decision = decideReminderWake(reminder, script);

        await tx
            .update(reminderFiresTable)
            .set({
                durationMs: result.durationMs ?? null,
                outcome: decision.outcome,
                scriptExitCode: result.exitCode,
                scriptOutput: result.output || null,
                scriptTimedOut: result.timedOut,
            })
            .where(
                and(
                    eq(reminderFiresTable.serverId, identity.serverId),
                    eq(reminderFiresTable.id, attention.fireId)
                )
            );
        await tx
            .update(remindersTable)
            .set({
                consecutiveFailures: decision.nextState.consecutiveFailures,
                lastWakeOutputHash: decision.nextState.lastWakeOutputHash,
            })
            .where(
                and(
                    eq(remindersTable.serverId, identity.serverId),
                    eq(remindersTable.id, attention.reminderId)
                )
            );
        await tx
            .delete(reminderAgentAttentionTable)
            .where(
                and(
                    eq(reminderAgentAttentionTable.serverId, identity.serverId),
                    eq(reminderAgentAttentionTable.id, attention.id)
                )
            );
        if (!decision.wake) {
            return null;
        }
        const [anchor] = await tx
            .select({ anchorChatId: remindersTable.anchorChatId })
            .from(remindersTable)
            .innerJoin(
                chatsTable,
                and(
                    eq(chatsTable.serverId, remindersTable.serverId),
                    eq(chatsTable.id, remindersTable.anchorChatId),
                    isNull(chatsTable.archivedAt),
                    isNull(chatsTable.deletedAt),
                    or(
                        isNull(chatsTable.parentChatId),
                        sql`exists (
                            select 1 from chats parent
                            where parent.server_id = ${chatsTable.serverId}
                                and parent.id = ${chatsTable.parentChatId}
                                and parent.archived_at is null
                                and parent.deleted_at is null
                        )`
                    )
                )
            )
            .where(
                and(
                    eq(remindersTable.serverId, identity.serverId),
                    eq(remindersTable.id, attention.reminderId)
                )
            )
            .limit(1);
        if (!anchor) {
            return null;
        }
        await enqueue(tx, {
            agentId: attention.agentId,
            chatId: attention.anchorChatId,
            content: reminderEnvelope({
                fireId: attention.fireId,
                nextFireAt: reminder.status === 'scheduled' ? reminder.fireAt : null,
                reminder,
                ...(decision.outcome === 'recovered' && decision.failureStreak !== null
                    ? { recoveredAfterFailures: decision.failureStreak }
                    : { script }),
            }),
            createdAt: new Date(),
            dedupeKey: attention.fireId,
            serverId: identity.serverId,
            source: 'reminder',
        });
    });
}
