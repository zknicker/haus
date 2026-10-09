import { and, asc, eq } from 'drizzle-orm';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentsTable,
    reminderCommandsTable,
    reminderFiresTable,
    remindersTable,
} from '../postgres/schema.ts';
import { requireServerMembership } from '../servers/server-access.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import type { HausUser } from '../users/haus-user.ts';
import {
    lockReminderCommand,
    parseReminderCommandResult,
    ReminderVersionConflictError,
} from './mutations.ts';
import { insertAnchoredReminderChangedEvent } from './reminder-events.ts';
import {
    type Reminder,
    type ReminderClock,
    ReminderCommandConflictError,
    readReminder,
    toReminder,
} from './reminder-model.ts';
import type { ReminderFire } from './reminder-queries.ts';
import { retireQueuedReminderFires } from './retire-fires.ts';

export class ReminderOperatorAccessDeniedError extends Error {
    constructor() {
        super('A Server Owner or Admin is required to operate reminders.');
        this.name = 'ReminderOperatorAccessDeniedError';
    }
}

/**
 * The reminder is gone from this Server. Retention deletes settled reminders,
 * so an Agent profile or a bookmarked run history can outlive its row; that is
 * a narrow not-found, never a Server fault.
 */
export class ReminderNotFoundError extends Error {
    constructor() {
        super('The reminder does not exist in this Server.');
        this.name = 'ReminderNotFoundError';
    }
}

export async function requireReminderOperator(
    db: Pick<HausDatabase, 'select'>,
    member: HausUser | null,
    serverId: string
) {
    const server = await requireServerMembership(db, member, serverId);
    if (server.role !== 'owner' && server.role !== 'admin') {
        throw new ReminderOperatorAccessDeniedError();
    }
    if (!member) {
        throw new ReminderOperatorAccessDeniedError();
    }
    return member;
}

export async function listOperatorReminders(
    db: HausDatabase,
    member: HausUser | null,
    input: {
        agentId?: string;
        serverId: string;
        status?: 'canceled' | 'fired' | 'scheduled';
    }
): Promise<Reminder[]> {
    await requireReminderOperator(db, member, input.serverId);
    const rows = await db
        .select({ agent: agentsTable, reminder: remindersTable })
        .from(remindersTable)
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
                input.agentId ? eq(remindersTable.ownerAgentId, input.agentId) : undefined,
                input.status ? eq(remindersTable.status, input.status) : undefined
            )
        )
        .orderBy(asc(remindersTable.fireAt), asc(remindersTable.id));
    return rows.map(({ agent, reminder }) => toReminder(reminder, agent.handle));
}

export async function listOperatorReminderRuns(
    db: HausDatabase,
    member: HausUser | null,
    input: { reminderId: string; serverId: string }
): Promise<ReminderFire[]> {
    await requireReminderOperator(db, member, input.serverId);
    await requireReminderInServer(db, input.serverId, input.reminderId);
    const rows = await db
        .select()
        .from(reminderFiresTable)
        .where(
            and(
                eq(reminderFiresTable.serverId, input.serverId),
                eq(reminderFiresTable.reminderId, input.reminderId)
            )
        )
        .orderBy(asc(reminderFiresTable.scheduledFor), asc(reminderFiresTable.id));
    return rows.map((row) => ({
        firedAt: row.firedAt.toISOString(),
        id: row.id,
        reminderId: row.reminderId,
        scheduledFor: row.scheduledFor.toISOString(),
    }));
}

export async function cancelOperatorReminder(
    db: HausDatabase,
    member: HausUser | null,
    input: {
        commandId: string;
        expectedVersion: number;
        reminderId: string;
        serverId: string;
    },
    clock: ReminderClock
): Promise<{ idempotent: boolean; reminder: Reminder }> {
    const fingerprint = JSON.stringify({
        action: 'cancel',
        expectedVersion: input.expectedVersion,
        reminderId: input.reminderId,
    });
    const result = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const operator = await requireReminderOperator(tx, member, input.serverId);
        await lockReminderCommand(tx, input.serverId, 'user', operator.id, input.commandId);
        const [command] = await tx
            .select({
                fingerprint: reminderCommandsTable.requestFingerprint,
                resultSnapshot: reminderCommandsTable.resultSnapshot,
            })
            .from(reminderCommandsTable)
            .where(
                and(
                    eq(reminderCommandsTable.serverId, input.serverId),
                    eq(reminderCommandsTable.actorKind, 'user'),
                    eq(reminderCommandsTable.actorId, operator.id),
                    eq(reminderCommandsTable.commandId, input.commandId)
                )
            )
            .limit(1);
        if (command) {
            if (command.fingerprint !== fingerprint) {
                throw new ReminderCommandConflictError();
            }
            return {
                event: null,
                idempotent: true,
                reminder: parseReminderCommandResult(command.resultSnapshot),
            };
        }
        const [reminder] = await tx
            .select()
            .from(remindersTable)
            .where(
                and(
                    eq(remindersTable.serverId, input.serverId),
                    eq(remindersTable.id, input.reminderId)
                )
            )
            .limit(1)
            .for('update');
        if (!reminder) {
            throw new ReminderNotFoundError();
        }
        if (reminder.version !== input.expectedVersion) {
            throw new ReminderVersionConflictError(reminder.version);
        }
        if (reminder.status === 'canceled') {
            throw new Error('The reminder is already canceled.');
        }
        const now = clock.now();
        const [updated] = await tx
            .update(remindersTable)
            .set({ status: 'canceled', updatedAt: now, version: reminder.version + 1 })
            .where(
                and(
                    eq(remindersTable.serverId, input.serverId),
                    eq(remindersTable.id, input.reminderId)
                )
            )
            .returning();
        if (!updated) {
            throw new Error('Failed to cancel the reminder.');
        }
        await retireQueuedReminderFires(tx, input.serverId, input.reminderId);
        const shapedReminder = await readReminder(tx, input.serverId, updated.id);
        await tx.insert(reminderCommandsTable).values({
            action: 'cancel',
            actorId: operator.id,
            actorKind: 'user',
            appliedVersion: updated.version,
            commandId: input.commandId,
            createdAt: now,
            id: createOpaqueId('rcm'),
            reminderId: updated.id,
            requestFingerprint: fingerprint,
            resultSnapshot: shapedReminder,
            serverId: input.serverId,
        });
        const event = await insertAnchoredReminderChangedEvent(tx, {
            action: 'canceled',
            chatId: updated.anchorChatId,
            createdAt: now,
            reminderId: updated.id,
            serverId: updated.serverId,
        });
        return {
            event,
            idempotent: false,
            reminder: shapedReminder,
        };
    });
    if (result.event) {
        emitDurableChatEvent({ audienceUserId: null, event: result.event });
    }
    return { idempotent: result.idempotent, reminder: result.reminder };
}

async function requireReminderInServer(
    db: Pick<HausDatabase, 'select'>,
    serverId: string,
    reminderId: string
) {
    const [reminder] = await db
        .select({ id: remindersTable.id })
        .from(remindersTable)
        .where(and(eq(remindersTable.serverId, serverId), eq(remindersTable.id, reminderId)))
        .limit(1);
    if (!reminder) {
        throw new ReminderNotFoundError();
    }
}
