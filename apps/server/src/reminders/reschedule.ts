import { and, eq } from 'drizzle-orm';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { reminderCommandsTable, remindersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { nextReminderFireAt, parseReminderRepeat, parseReminderSnooze } from './cadence.ts';
import {
    lockReminderCommand,
    type ReminderCommandInput,
    ReminderVersionConflictError,
    readExistingCommand,
} from './mutations.ts';
import { insertAnchoredReminderChangedEvent } from './reminder-events.ts';
import {
    type Reminder,
    type ReminderClock,
    requireActiveAgent,
    requireAgentAnchor,
    toReminder,
    validReminderDescription,
    validReminderTitle,
} from './reminder-model.ts';
import { alignUpdateToCadence } from './schedule-timing.ts';

interface UpdateReminderInput extends ReminderCommandInput {
    description?: string | null;
    fireAt?: Date;
    repeat?: string | null;
    script?: string | null;
    title?: string;
}

interface SnoozeReminderInput extends ReminderCommandInput {
    duration: string;
}

interface ReminderRescheduleValues {
    description?: string | null;
    fireAt?: Date;
    repeat?: string | null;
    script?: string | null;
    title?: string;
}

export async function updateReminder(
    db: HausDatabase,
    agentId: string,
    input: UpdateReminderInput,
    clock: ReminderClock
): Promise<{ idempotent: boolean; reminder: Reminder }> {
    const now = clock.now();
    const values = validatedUpdate(input);
    return applyReschedule(db, agentId, input, {
        action: 'update',
        fingerprint: JSON.stringify({
            action: 'update',
            description: input.description,
            expectedVersion: input.expectedVersion,
            fireAt: input.fireAt?.toISOString(),
            reminderId: input.reminderId,
            repeat: values.repeat,
            script: input.script,
            title: input.title,
        }),
        now,
        requestedFireAt: input.fireAt,
        values,
    });
}

export async function snoozeReminder(
    db: HausDatabase,
    agentId: string,
    input: SnoozeReminderInput,
    clock: ReminderClock
): Promise<{ idempotent: boolean; reminder: Reminder }> {
    const delay = parseReminderSnooze(input.duration);
    if (delay === null) {
        throw new Error('Reminder snooze does not use the supported grammar.');
    }
    const now = clock.now();
    const fireAt = new Date(now.getTime() + delay);
    return applyReschedule(db, agentId, input, {
        action: 'snooze',
        fingerprint: JSON.stringify({
            action: 'snooze',
            duration: input.duration,
            expectedVersion: input.expectedVersion,
            reminderId: input.reminderId,
        }),
        now,
        requestedFireAt: fireAt,
        values: { fireAt },
    });
}

async function applyReschedule(
    db: HausDatabase,
    agentId: string,
    input: ReminderCommandInput,
    change: {
        action: 'snooze' | 'update';
        fingerprint: string;
        now: Date;
        requestedFireAt: Date | undefined;
        values: ReminderRescheduleValues;
    }
) {
    const result = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const agent = await requireActiveAgent(tx, input.serverId, agentId);
        await lockReminderCommand(tx, input.serverId, 'agent', agentId, input.commandId);
        const existing = await readExistingCommand(tx, input, agentId, change.fingerprint);
        if (existing) {
            await requireAgentAnchor(tx, {
                agentId,
                anchorChatId: existing.anchorChatId,
                anchorMessageId: existing.anchorMessageId,
                serverId: input.serverId,
            });
            return { event: null, idempotent: true, reminder: existing };
        }
        if (
            change.requestedFireAt &&
            (!Number.isFinite(change.requestedFireAt.getTime()) ||
                change.requestedFireAt.getTime() <= change.now.getTime())
        ) {
            throw new Error('Reminder fire time must be in the future.');
        }
        const [reminder] = await tx
            .select()
            .from(remindersTable)
            .where(
                and(
                    eq(remindersTable.serverId, input.serverId),
                    eq(remindersTable.id, input.reminderId),
                    eq(remindersTable.ownerAgentId, agentId)
                )
            )
            .limit(1)
            .for('update');
        if (!reminder) {
            throw new Error('The reminder is not owned by this Agent.');
        }
        await requireAgentAnchor(tx, {
            agentId,
            anchorChatId: reminder.anchorChatId,
            anchorMessageId: reminder.anchorMessageId,
            serverId: input.serverId,
        });
        if (reminder.version !== input.expectedVersion) {
            throw new ReminderVersionConflictError(reminder.version);
        }
        if (reminder.status === 'canceled') {
            throw new Error('A canceled reminder cannot be changed.');
        }
        const values =
            change.action === 'update'
                ? alignUpdateToCadence(change.values, reminder, change.now)
                : change.values;
        if (reminder.status === 'fired' && values.fireAt === undefined) {
            throw new Error('A fired reminder needs a new future fire time.');
        }
        const effectiveRepeat = values.repeat === undefined ? reminder.repeat : values.repeat;
        if (effectiveRepeat) {
            const repeat = parseReminderRepeat(effectiveRepeat);
            if (!repeat) {
                throw new Error('Reminder repeat does not use the supported grammar.');
            }
            nextReminderFireAt(
                repeat,
                (values.fireAt ?? reminder.fireAt).getTime(),
                reminder.timezone
            );
        }
        const [updated] = await tx
            .update(remindersTable)
            .set({
                ...values,
                status: 'scheduled',
                updatedAt: change.now,
                version: reminder.version + 1,
            })
            .where(
                and(
                    eq(remindersTable.serverId, input.serverId),
                    eq(remindersTable.id, input.reminderId)
                )
            )
            .returning();
        if (!updated) {
            throw new Error('Failed to change the reminder.');
        }
        await tx.insert(reminderCommandsTable).values({
            action: change.action,
            actorId: agentId,
            actorKind: 'agent',
            appliedVersion: updated.version,
            commandId: input.commandId,
            createdAt: change.now,
            id: createOpaqueId('rcm'),
            reminderId: input.reminderId,
            requestFingerprint: change.fingerprint,
            resultSnapshot: toReminder(updated, agent.handle),
            serverId: input.serverId,
        });
        const event = await insertAnchoredReminderChangedEvent(tx, {
            action: change.action === 'snooze' ? 'snoozed' : 'updated',
            chatId: updated.anchorChatId,
            createdAt: change.now,
            reminderId: updated.id,
            serverId: updated.serverId,
        });
        return {
            event,
            idempotent: false,
            reminder: toReminder(updated, agent.handle),
        };
    });
    if (result.event) {
        emitDurableChatEvent({ audienceUserId: null, event: result.event });
    }
    return { idempotent: result.idempotent, reminder: result.reminder };
}

function validatedUpdate(input: UpdateReminderInput) {
    const values: ReminderRescheduleValues = {};
    if (input.title !== undefined) {
        values.title = validReminderTitle(input.title);
    }
    if (input.description !== undefined) {
        values.description =
            input.description === null ? null : validReminderDescription(input.description);
    }
    if (input.fireAt !== undefined) {
        values.fireAt = input.fireAt;
    }
    if (input.repeat !== undefined) {
        const repeat = input.repeat === null ? null : parseReminderRepeat(input.repeat);
        if (input.repeat !== null && repeat === null) {
            throw new Error('Reminder repeat does not use the supported grammar.');
        }
        values.repeat = repeat?.spec ?? null;
    }
    if (input.script !== undefined) {
        const bytes = input.script === null ? 0 : Buffer.byteLength(input.script);
        if (input.script !== null && (bytes < 1 || bytes > 16_384)) {
            throw new Error('Reminder script must be between 1 and 16384 UTF-8 bytes.');
        }
        values.script = input.script;
    }
    if (Object.keys(values).length === 0) {
        throw new Error('A reminder update must change at least one field.');
    }
    return values;
}
