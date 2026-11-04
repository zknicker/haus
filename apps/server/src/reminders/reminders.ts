import { and, asc, eq, sql } from 'drizzle-orm';
import { requireChatWritable } from '../chats/chat-access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { createOpaqueId } from '../postgres/opaque-id.ts';
import {
    agentsTable,
    chatsTable,
    reminderCommandsTable,
    remindersTable,
} from '../postgres/schema.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { lockServerRow } from '../servers/server-lock.ts';
import { parseReminderRepeat } from './cadence.ts';
import { lockReminderCommand, parseReminderCommandResult } from './mutations.ts';
import { prepareReminderEvent } from './reminder-events.ts';
import {
    agentCanAccessAnchor,
    matchesEarlierScheduleFingerprint,
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
import { resolveScheduleTiming } from './schedule-timing.ts';

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
    readOwnedReminder,
} from './reminder-queries.ts';
export {
    snoozeReminder,
    updateReminder,
} from './reschedule.ts';
export { tickReminders } from './scheduler.ts';

/** Reminder row for the owning Agent, with whether its anchor Chat is still reachable. */
export interface AuthorReminder extends Reminder {
    anchorAccessible: boolean;
}

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
        failAfter: input.failAfter ?? null,
        // A derived calendar first fire is not part of the request, so a replay
        // after that slot passes still matches.
        fireAt: input.fireAt?.toISOString() ?? null,
        repeat: repeat?.spec ?? input.repeat ?? null,
        script: input.script ?? null,
        title,
        wakeOnChange: input.wakeOnChange ?? false,
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    });

    // Pre-0060 commands did not include description. Retain this decoder until
    // pre-0060 callers are unsupported and a migration marks or removes retained
    // legacy fingerprints; recurring command receipts do not expire automatically.
    const legacyFingerprint = JSON.stringify({
        anchorChatId: input.anchorChatId,
        anchorMessageId: input.anchorMessageId,
        fireAt: input.fireAt?.toISOString() ?? null,
        repeat: repeat?.spec ?? input.repeat ?? null,
        script: input.script ?? null,
        title,
    });

    // Pre-wake-rules commands did not include failAfter/wakeOnChange. Retain
    // this decoder for the same reason as the legacy decoder above.
    const preWakeRulesFingerprint = JSON.stringify({
        anchorChatId: input.anchorChatId,
        anchorMessageId: input.anchorMessageId,
        description,
        fireAt: input.fireAt?.toISOString() ?? null,
        repeat: repeat?.spec ?? input.repeat ?? null,
        script: input.script ?? null,
        title,
        ...(input.timezone !== undefined ? { timezone: input.timezone } : {}),
    });

    const result = await db.transaction(async (tx) => {
        await lockServerRow(tx, input.serverId);
        const agent = await requireActiveAgent(tx, input.serverId, agentId);
        await requireAgentAnchor(tx, {
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
            const replaysAnEarlierContract = matchesEarlierScheduleFingerprint(
                existingCommand.fingerprint,
                input,
                { description, legacyFingerprint, preWakeRulesFingerprint }
            );
            if (existingCommand.fingerprint !== fingerprint && !replaysAnEarlierContract) {
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
        const { fireAt, timezone } = resolveScheduleTiming(input, repeat, {
            homeTimezone: agent.homeTimezone,
            now,
        });
        await requireChatWritable(tx, {
            chatId: input.anchorChatId,
            serverId: input.serverId,
        });
        if (fireAt.getTime() <= now.getTime()) {
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
                failAfter: input.failAfter ?? null,
                fireAt,
                id: reminderId,
                ownerAgentId: agentId,
                repeat: repeat?.spec ?? input.repeat ?? null,
                script: input.script ?? null,
                serverId: input.serverId,
                status: 'scheduled',
                timezone,
                title,
                updatedAt: now,
                wakeOnChange: input.wakeOnChange ?? false,
            })
            .returning();
        // Scheduling posts nothing to the transcript. The Automations tab and the
        // `reminder.updated` event carry the new Reminder; only the Agent's own
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

        const reminderEvent = prepareReminderEvent({
            action: 'scheduled',
            ownerAgentId: agentId,
            reminderId,
            serverId: input.serverId,
        });
        return {
            events: [reminderEvent],
            idempotent: false,
            reminder: shapedReminder,
        };
    });

    for (const event of result.events) {
        publishRealtime(event);
    }
    return { idempotent: result.idempotent, reminder: result.reminder };
}

/**
 * Author-facing reminder list. Access is checked per reminder: settled
 * reminders whose anchor the author can no longer reach are omitted; still-
 * scheduled ones stay visible so the author can cancel or see that the
 * anchor is gone. One inaccessible sibling must not fail the whole list.
 */
export async function listReminders(
    db: HausDatabase,
    input: {
        actor: { agentId: string; kind: 'agent' };
        serverId: string;
    }
): Promise<AuthorReminder[]> {
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
    const listed: AuthorReminder[] = [];
    for (const { agent, reminder } of rows) {
        const anchorAccessible = await agentCanAccessAnchor(db, {
            agentId: input.actor.agentId,
            anchorChatId: reminder.anchorChatId,
            anchorMessageId: reminder.anchorMessageId,
            serverId: input.serverId,
        });
        if (!(anchorAccessible || reminder.status === 'scheduled')) {
            continue;
        }
        listed.push({
            ...toReminder(reminder, agent.handle),
            anchorAccessible,
        });
    }
    return listed;
}
