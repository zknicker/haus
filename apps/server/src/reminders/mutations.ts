import { reminderSchema } from '@haus/api';
import { and, eq, sql } from 'drizzle-orm';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import { reminderCommandsTable, remindersTable } from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { insertAnchoredReminderChangedEvent } from './reminder-events.ts';
import {
    type Reminder,
    type ReminderClock,
    ReminderCommandConflictError,
    readReminder,
    requireActiveAgent,
    requireAgentAnchor,
    toReminder,
} from './reminder-model.ts';
import { retireQueuedReminderFires } from './retire-fires.ts';

export interface ReminderCommandInput {
    commandId: string;
    expectedVersion: number;
    reminderId: string;
    serverId: string;
}

export async function cancelReminder(
    db: HausDatabase,
    agentId: string,
    input: ReminderCommandInput,
    clock: ReminderClock
): Promise<{ idempotent: boolean; reminder: Reminder }> {
    const fingerprint = JSON.stringify({
        action: 'cancel',
        expectedVersion: input.expectedVersion,
        reminderId: input.reminderId,
    });
    const result = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const agent = await requireActiveAgent(tx, input.serverId, agentId);
        await lockReminderCommand(tx, input.serverId, 'agent', agentId, input.commandId);
        const existing = await readExistingCommand(tx, input, agentId, fingerprint);
        if (existing) {
            await requireAgentAnchor(tx, {
                agentId,
                anchorChatId: existing.anchorChatId,
                anchorMessageId: existing.anchorMessageId,
                serverId: input.serverId,
            });
            return { event: null, idempotent: true, reminder: existing };
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
            throw new Error('The reminder is already canceled.');
        }
        const now = clock.now();
        const [updated] = await tx
            .update(remindersTable)
            .set({
                status: 'canceled',
                updatedAt: now,
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
            throw new Error('Failed to cancel the reminder.');
        }
        await retireQueuedReminderFires(tx, input.serverId, input.reminderId);
        await tx.insert(reminderCommandsTable).values({
            action: 'cancel',
            actorId: agentId,
            actorKind: 'agent',
            appliedVersion: updated.version,
            commandId: input.commandId,
            createdAt: now,
            id: createOpaqueId('rcm'),
            reminderId: input.reminderId,
            requestFingerprint: fingerprint,
            resultSnapshot: toReminder(updated, agent.handle),
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
            reminder: toReminder(updated, agent.handle),
        };
    });
    if (result.event) {
        emitDurableChatEvent({ audienceUserId: null, event: result.event });
    }
    return { idempotent: result.idempotent, reminder: result.reminder };
}

export async function lockReminderCommand(
    db: Pick<HausDatabase, 'execute'>,
    serverId: string,
    actorKind: 'agent' | 'user',
    actorId: string,
    commandId: string
) {
    const key = `reminder-command:${serverId}:${actorKind}:${actorId}:${commandId}`;
    await db.execute(sql`select pg_advisory_xact_lock(hashtextextended(${key}, 0))`);
}

export class ReminderVersionConflictError extends Error {
    readonly currentVersion: number;

    constructor(currentVersion: number) {
        super(`The reminder changed; its current version is ${currentVersion}.`);
        this.currentVersion = currentVersion;
        this.name = 'ReminderVersionConflictError';
    }
}

export async function readExistingCommand(
    db: HausDatabase,
    input: ReminderCommandInput,
    agentId: string,
    fingerprint: string
) {
    const [command] = await db
        .select({
            fingerprint: reminderCommandsTable.requestFingerprint,
            resultSnapshot: reminderCommandsTable.resultSnapshot,
        })
        .from(reminderCommandsTable)
        .where(
            and(
                eq(reminderCommandsTable.serverId, input.serverId),
                eq(reminderCommandsTable.actorKind, 'agent'),
                eq(reminderCommandsTable.actorId, agentId),
                eq(reminderCommandsTable.commandId, input.commandId)
            )
        )
        .limit(1);
    if (!command) {
        return null;
    }
    if (command.fingerprint !== fingerprint) {
        throw new ReminderCommandConflictError();
    }
    // The snapshot proves what was applied; the receipt must describe what exists now.
    return await readReminder(
        db,
        input.serverId,
        parseReminderCommandResult(command.resultSnapshot).id
    );
}

export function parseReminderCommandResult(snapshot: unknown): Reminder {
    return reminderSchema.parse(snapshot);
}
