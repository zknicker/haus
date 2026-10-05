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
    const title = validReminderTitle(input.title);
    const description =
        input.description == null ? null : validReminderDescription(input.description);
    const repeat = input.repeat ? parseReminderRepeat(input.repeat) : null;
    validateScheduleInput(input, { repeat });
    const fingerprint = JSON.stringify({
        anchorChatId: input.anchorChatId,
        anchorMessageId: input.anchorMessageId,
        description,
        fireAt: input.fireAt.toISOString(),
        repeat: repeat?.spec ?? null,
        script: input.script ?? null,
        title,
    });

    const result = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const agent = await requireActiveAgent(tx, input.serverId, agentId);
        if (!isValidReminderTimezone(agent.homeTimezone)) {
            throw new Error('The reminder author must have a valid IANA timezone.');
        }
        if (repeat) {
            nextReminderFireAt(repeat, input.fireAt.getTime(), agent.homeTimezone);
        }
        const anchor = await requireAgentAnchor(tx, {
            agentId,
            anchorChatId: input.anchorChatId,
            anchorMessageId: input.anchorMessageId,
            serverId: input.serverId,
        });
        await requireChatWritable(tx, {
            chatId: input.anchorChatId,
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
            if (existingCommand.fingerprint !== fingerprint) {
                throw new ReminderCommandConflictError();
            }
            return {
                events: [],
                idempotent: true,
                reminder: parseReminderCommandResult(existingCommand.resultSnapshot),
            };
        }
        if (input.fireAt.getTime() <= now.getTime()) {
            throw new Error('Reminder fire time must be in the future.');
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
                repeat: repeat?.spec ?? null,
                script: input.script ?? null,
                serverId: input.serverId,
                status: 'scheduled',
                timezone: agent.homeTimezone,
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
