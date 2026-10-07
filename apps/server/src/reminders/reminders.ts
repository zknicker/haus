import { and, asc, eq, sql } from 'drizzle-orm';
import { requireChatWritable } from '../chats/chat-access.ts';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentsTable,
    chatsTable,
    reminderCommandsTable,
    remindersTable,
} from '../postgres/schema.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { isValidReminderTimezone, nextReminderFireAt, parseReminderRepeat } from './cadence.ts';
import { lockReminderCommand, parseReminderCommandResult } from './mutations.ts';
import { insertReminderChangedEvent } from './reminder-events.ts';
import {
    type Reminder,
    type ReminderClock,
    ReminderCommandConflictError,
    ReminderScheduleExpiredError,
    readReminder,
    requireActiveAgent,
    requireAgentAnchor,
    type ScheduleReminderInput,
    toReminder,
    validateScheduleInput,
    validReminderDescription,
    validReminderTitle,
} from './reminder-model.ts';

export {
    cancelReminder,
    ReminderVersionConflictError,
} from './mutations.ts';
export type {
    Reminder,
    ReminderClock,
    ScheduleReminderInput,
} from './reminder-model.ts';
export { ReminderCommandConflictError } from './reminder-model.ts';
export {
    listReminderAgentAttention,
    listReminderFires,
} from './reminder-queries.ts';
export {
    snoozeReminder,
    updateReminder,
} from './reschedule.ts';
export { tickReminders } from './scheduler.ts';

export async function scheduleReminder(
    db: HausDatabase,
    agentId: string,
    input: ScheduleReminderInput,
    clock: ReminderClock
): Promise<{ idempotent: boolean; reminder: Reminder }> {
    const now = clock.now();
    // Replay old commands before applying the current write contract.
    const title = input.title.trim();
    const description = input.description == null ? null : input.description.trim();
    const repeat = input.repeat ? parseReminderRepeat(input.repeat) : null;
    const fingerprint = JSON.stringify({
        anchorChatId: input.anchorChatId,
        anchorMessageId: input.anchorMessageId,
        description,
        fireAt: input.fireAt.toISOString(),
        repeat: repeat?.spec ?? input.repeat ?? null,
        script: input.script ?? null,
        title,
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    });

    // Pre-0060 commands did not include description. Retain this decoder until
    // pre-0060 callers are unsupported and a migration marks or removes retained
    // legacy fingerprints; recurring command receipts do not expire automatically.
    const legacyFingerprint = JSON.stringify({
        anchorChatId: input.anchorChatId,
        anchorMessageId: input.anchorMessageId,
        fireAt: input.fireAt.toISOString(),
        repeat: repeat?.spec ?? input.repeat ?? null,
        script: input.script ?? null,
        title,
    });

    const result = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const agent = await requireActiveAgent(tx, input.serverId, agentId);
        const anchor = await requireAgentAnchor(tx, {
            agentId,
            anchorChatId: input.anchorChatId,
            anchorMessageId: input.anchorMessageId,
            serverId: input.serverId,
        });
        await lockReminderCommand(tx, input.serverId, 'agent', agentId, input.commandId);
        const [existingCommand] = await tx
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
        if (existingCommand) {
            if (
                existingCommand.fingerprint !== fingerprint &&
                !(
                    input.timezone === undefined &&
                    description === null &&
                    existingCommand.fingerprint === legacyFingerprint
                )
            ) {
                throw new ReminderCommandConflictError();
            }
            return {
                events: [],
                idempotent: true,
                reminder: await readReminder(
                    tx,
                    input.serverId,
                    parseReminderCommandResult(existingCommand.resultSnapshot).id
                ),
            };
        }
        validReminderTitle(title);
        if (description !== null) {
            validReminderDescription(description);
        }
        validateScheduleInput(input, { repeat });
        const timezone = validatedTimezone(input.timezone, agent.homeTimezone);
        if (repeat) {
            nextReminderFireAt(repeat, input.fireAt.getTime(), timezone);
        }
        await requireChatWritable(tx, {
            chatId: input.anchorChatId,
            serverId: input.serverId,
        });
        if (input.fireAt.getTime() <= now.getTime()) {
            throw new ReminderScheduleExpiredError();
        }

        await tx.execute(sql`
            select id from chats
            where server_id = ${input.serverId} and id = ${input.anchorChatId}
            for update
        `);
        const reminderId = createOpaqueId('rem');
        const [reminder] = await tx
            .insert(remindersTable)
            .values({
                anchorChatId: input.anchorChatId,
                anchorMessageId: input.anchorMessageId,
                createdAt: now,
                description,
                fireAt: input.fireAt,
                id: reminderId,
                ownerAgentId: agentId,
                repeat: repeat?.spec ?? input.repeat ?? null,
                script: input.script ?? null,
                serverId: input.serverId,
                status: 'scheduled',
                timezone,
                title,
                updatedAt: now,
            })
            .returning();
        // Scheduling posts nothing to the transcript. The Automations tab and the
        // `reminder.changed` event carry the new Reminder; only the Agent's own
        // message, sent with `--cause`, ever appears in Chat.
        const [anchorChat] = await tx
            .select({ sequence: chatsTable.lastMessageSequence })
            .from(chatsTable)
            .where(
                and(eq(chatsTable.serverId, input.serverId), eq(chatsTable.id, input.anchorChatId))
            )
            .for('update');
        if (!(reminder && anchorChat)) {
            throw new Error('Failed to schedule the reminder.');
        }
        const shapedReminder = toReminder(reminder, agent.handle);

        await tx.insert(reminderCommandsTable).values({
            action: 'schedule',
            actorId: agentId,
            actorKind: 'agent',
            appliedVersion: reminder.version,
            commandId: input.commandId,
            createdAt: now,
            id: createOpaqueId('rcm'),
            reminderId,
            requestFingerprint: fingerprint,
            resultSnapshot: shapedReminder,
            serverId: input.serverId,
        });

        const reminderEvent = await insertReminderChangedEvent(tx, {
            action: 'scheduled',
            chatId: input.anchorChatId,
            createdAt: now,
            parentChatId: anchor.parentChatId,
            reminderId,
            sequence: anchorChat.sequence,
            serverId: input.serverId,
        });
        return {
            events: [reminderEvent],
            idempotent: false,
            reminder: shapedReminder,
        };
    });

    for (const event of result.events) {
        emitDurableChatEvent({ audienceUserId: null, event });
    }
    return { idempotent: result.idempotent, reminder: result.reminder };
}

export async function listReminders(
    db: HausDatabase,
    input: {
        actor: { agentId: string; kind: 'agent' };
        serverId: string;
    }
): Promise<Reminder[]> {
    await requireActiveAgent(db, input.serverId, input.actor.agentId);
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
                eq(remindersTable.ownerAgentId, input.actor.agentId)
            )
        )
        .orderBy(asc(remindersTable.fireAt), asc(remindersTable.id));
    await Promise.all(
        rows.map(({ reminder }) =>
            requireAgentAnchor(db, {
                agentId: input.actor.agentId,
                anchorChatId: reminder.anchorChatId,
                anchorMessageId: reminder.anchorMessageId,
                serverId: input.serverId,
            })
        )
    );
    return rows.map(({ agent, reminder }) => toReminder(reminder, agent.handle));
}

function validatedTimezone(explicit: string | undefined, home: string): string {
    const timezone = explicit ?? home;
    if (!isValidReminderTimezone(timezone)) {
        throw new Error('Provide a valid IANA timezone for the reminder.');
    }
    return timezone;
}
