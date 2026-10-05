import type { ServerDurableEvent } from '@haus/api';
import { and, asc, eq, lte, notInArray, sql } from 'drizzle-orm';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentsTable,
    chatsTable,
    reminderAgentAttentionTable,
    reminderFiresTable,
    remindersTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { nextReminderFireAt, parseReminderRepeat } from './cadence.ts';
import { reminderEnvelope } from './reminder-envelope.ts';
import {
    insertAnchoredReminderChangedEvent,
    insertReminderChangedEvent,
} from './reminder-events.ts';
import {
    ReminderAgentInactiveError,
    ReminderAnchorAccessError,
    type ReminderClock,
    ReminderFireError,
    requireActiveAgent,
    requireAgentAnchor,
} from './reminder-model.ts';
import { retireQueuedReminderFires } from './retire-fires.ts';

export async function tickReminders(
    db: HausDatabase,
    clock: ReminderClock,
    delivery?: AgentDelivery
) {
    const now = clock.now();
    const failedReminderIds: string[] = [];
    let fired = 0;
    while (true) {
        let result: ReminderFireAttempt | null;
        try {
            result = await fireNextDueReminder(db, now, failedReminderIds, delivery);
        } catch (cause) {
            if (!(cause instanceof ReminderFireError)) {
                throw cause;
            }
            failedReminderIds.push(cause.reminderId);
            continue;
        }
        if (!result) {
            if (failedReminderIds.length > 0) {
                throw new Error('One or more reminders could not fire.');
            }
            return { fired };
        }
        if (result.fired) {
            fired += 1;
        }
        for (const event of result.events) {
            emitDurableChatEvent({ audienceUserId: null, event });
        }
        if (delivery && result.dispatch?.kind === 'agent') {
            await delivery.dispatchAgent(result.dispatch.agentId, result.dispatch.serverId);
        }
        if (delivery && result.dispatch?.kind === 'script') {
            delivery.dispatchReminderScript(result.dispatch.computerId, result.dispatch.command);
        }
    }
}

async function fireNextDueReminder(
    db: HausDatabase,
    now: Date,
    excludedReminderIds: string[],
    delivery?: AgentDelivery
): Promise<ReminderFireAttempt | null> {
    let selectedReminderId: string | null = null;
    try {
        return await db.transaction(async (tx) => {
            const [candidate] = await tx
                .select({ id: remindersTable.id, serverId: remindersTable.serverId })
                .from(remindersTable)
                .where(
                    and(
                        eq(remindersTable.status, 'scheduled'),
                        lte(remindersTable.fireAt, now),
                        writableReminderAnchor(),
                        excludedReminderIds.length > 0
                            ? notInArray(remindersTable.id, excludedReminderIds)
                            : undefined
                    )
                )
                .orderBy(asc(remindersTable.fireAt), asc(remindersTable.id))
                .limit(1);
            if (!candidate) {
                return null;
            }
            selectedReminderId = candidate.id;
            await lockServerRow(tx, candidate.serverId);
            const [reminder] = await tx
                .select()
                .from(remindersTable)
                .where(
                    and(
                        eq(remindersTable.serverId, candidate.serverId),
                        eq(remindersTable.id, candidate.id),
                        eq(remindersTable.status, 'scheduled'),
                        lte(remindersTable.fireAt, now),
                        writableReminderAnchor()
                    )
                )
                .for('update', { skipLocked: true });
            if (!reminder) {
                return { dispatch: null, events: [], fired: false };
            }

            const canceled = await cancelIfUnauthorized(tx, reminder, now);
            if (canceled) {
                return { dispatch: null, events: [canceled], fired: true };
            }
            // A fire posts no message, so the Chat sequence never moves. The
            // locked read still pins the anchor for the rest of the commit.
            const [chat] = await tx
                .select({
                    parentChatId: chatsTable.parentChatId,
                    sequence: chatsTable.lastMessageSequence,
                })
                .from(chatsTable)
                .where(
                    and(
                        eq(chatsTable.serverId, reminder.serverId),
                        eq(chatsTable.id, reminder.anchorChatId)
                    )
                )
                .for('update');
            if (!chat) {
                throw new Error('The reminder anchor Chat no longer exists.');
            }

            const [agent] = await tx
                .select({ computerId: agentsTable.computerId })
                .from(agentsTable)
                .where(
                    and(
                        eq(agentsTable.serverId, reminder.serverId),
                        eq(agentsTable.id, reminder.ownerAgentId)
                    )
                )
                .limit(1);
            const fireId = createOpaqueId('rmf');
            const attentionId = createOpaqueId('rma');
            await tx.insert(reminderFiresTable).values({
                firedAt: now,
                // The fire records whether this wake ran a script. Editing the
                // reminder later changes the next wake, never this one.
                hasScript: reminder.script !== null,
                id: fireId,
                reminderId: reminder.id,
                scheduledFor: reminder.fireAt,
                serverId: reminder.serverId,
            });
            await tx.insert(reminderAgentAttentionTable).values({
                agentId: reminder.ownerAgentId,
                anchorChatId: reminder.anchorChatId,
                fireId,
                id: attentionId,
                kind: reminder.script === null ? 'reminder' : 'reminder_script',
                queuedAt: now,
                reminderId: reminder.id,
                script: reminder.script,
                serverId: reminder.serverId,
            });

            const repeat = reminder.repeat ? parseReminderRepeat(reminder.repeat) : null;
            const nextFireAt = repeat
                ? new Date(nextReminderFireAt(repeat, now.getTime(), reminder.timezone))
                : null;
            // A script reminder wakes its Agent only once the script settles, so
            // its envelope can carry the run's outcome.
            if (delivery && reminder.script === null) {
                await delivery.enqueue(tx, {
                    agentId: reminder.ownerAgentId,
                    chatId: reminder.anchorChatId,
                    content: reminderEnvelope({ fireId, nextFireAt, reminder }),
                    createdAt: now,
                    dedupeKey: fireId,
                    serverId: reminder.serverId,
                    source: 'reminder',
                });
            }
            await tx
                .update(remindersTable)
                .set({
                    fireAt: nextFireAt ?? reminder.fireAt,
                    status: repeat ? 'scheduled' : 'fired',
                    updatedAt: now,
                    version: reminder.version + 1,
                })
                .where(
                    and(
                        eq(remindersTable.serverId, reminder.serverId),
                        eq(remindersTable.id, reminder.id)
                    )
                );
            const reminderEvent = await insertReminderChangedEvent(tx, {
                action: 'fired',
                chatId: reminder.anchorChatId,
                createdAt: now,
                parentChatId: chat.parentChatId,
                reminderId: reminder.id,
                sequence: chat.sequence,
                serverId: reminder.serverId,
            });
            return {
                dispatch:
                    reminder.script === null
                        ? {
                              agentId: reminder.ownerAgentId,
                              kind: 'agent' as const,
                              serverId: reminder.serverId,
                          }
                        : agent?.computerId
                          ? {
                                command: {
                                    agentId: reminder.ownerAgentId,
                                    attentionId,
                                    fireId,
                                    reminderId: reminder.id,
                                    script: reminder.script,
                                    type: 'reminder-script' as const,
                                },
                                computerId: agent.computerId,
                                kind: 'script' as const,
                            }
                          : null,
                events: [reminderEvent],
                fired: true,
            };
        });
    } catch (cause) {
        if (selectedReminderId) {
            throw new ReminderFireError(selectedReminderId, cause);
        }
        throw cause;
    }
}

async function cancelIfUnauthorized(
    db: HausDatabase,
    reminder: typeof remindersTable.$inferSelect,
    now: Date
): Promise<ServerDurableEvent | null> {
    try {
        await requireActiveAgent(db, reminder.serverId, reminder.ownerAgentId);
        await requireAgentAnchor(db, {
            agentId: reminder.ownerAgentId,
            anchorChatId: reminder.anchorChatId,
            anchorMessageId: reminder.anchorMessageId,
            serverId: reminder.serverId,
        });
        return null;
    } catch (cause) {
        if (
            cause instanceof ReminderAgentInactiveError ||
            cause instanceof ReminderAnchorAccessError
        ) {
            return await cancelUnauthorizedReminder(db, reminder, now);
        }
        throw cause;
    }
}

function writableReminderAnchor() {
    return sql`exists (
        select 1 from chats anchor
        where anchor.server_id = ${remindersTable.serverId}
            and anchor.id = ${remindersTable.anchorChatId}
            and anchor.archived_at is null
            and anchor.deleted_at is null
            and (
                anchor.kind <> 'thread'
                or exists (
                    select 1 from chats parent
                    where parent.server_id = anchor.server_id
                        and parent.id = anchor.parent_chat_id
                        and parent.archived_at is null
                        and parent.deleted_at is null
                )
            )
    )`;
}

interface ReminderFireAttempt {
    dispatch:
        | { agentId: string; kind: 'agent'; serverId: string }
        | {
              command: {
                  agentId: string;
                  attentionId: string;
                  fireId: string;
                  reminderId: string;
                  script: string;
                  type: 'reminder-script';
              };
              computerId: string;
              kind: 'script';
          }
        | null;
    events: ServerDurableEvent[];
    fired: boolean;
}

async function cancelUnauthorizedReminder(
    db: HausDatabase,
    reminder: typeof remindersTable.$inferSelect,
    now: Date
) {
    await db
        .update(remindersTable)
        .set({
            status: 'canceled',
            updatedAt: now,
            version: reminder.version + 1,
        })
        .where(
            and(eq(remindersTable.serverId, reminder.serverId), eq(remindersTable.id, reminder.id))
        );
    await db
        .delete(reminderAgentAttentionTable)
        .where(
            and(
                eq(reminderAgentAttentionTable.serverId, reminder.serverId),
                eq(reminderAgentAttentionTable.reminderId, reminder.id)
            )
        );
    await retireQueuedReminderFires(db, reminder.serverId, reminder.id);
    return insertAnchoredReminderChangedEvent(db, {
        action: 'canceled',
        chatId: reminder.anchorChatId,
        createdAt: now,
        reminderId: reminder.id,
        serverId: reminder.serverId,
    });
}
