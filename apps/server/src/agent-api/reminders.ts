import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { Reminder } from '../reminders/reminder-model.ts';
import {
    cancelReminder,
    listReminderFires,
    listReminders,
    scheduleReminder,
    snoozeReminder,
    updateReminder,
} from '../reminders/reminders.ts';
import { resolveAgentMessage } from './message-read.ts';
import { targetForChat } from './message-view.ts';

const clock = { now: () => new Date() };

export async function scheduleAgentReminder(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: {
        commandId: string;
        description?: string;
        fireAt: string;
        messageId: string;
        repeat?: string;
        script?: string;
        title: string;
        timezone?: string;
    }
) {
    const anchor = await resolveAgentMessage(db, runner, input.messageId);
    const fireAt = new Date(input.fireAt);
    const result = await scheduleReminder(
        db,
        runner.agentId,
        {
            anchorChatId: anchor.chat_id,
            anchorMessageId: anchor.id,
            commandId: input.commandId,
            description: input.description,
            fireAt,
            repeat: input.repeat,
            script: input.script,
            serverId: runner.serverId,
            title: input.title,
            timezone: input.timezone,
        },
        clock
    );
    return {
        reminder: await toCliReminder(db, runner.serverId, result.reminder),
        replayed: result.idempotent,
    };
}

export async function listAgentReminders(
    db: HausDatabase,
    runner: ResolvedRunner,
    statuses?: string[]
) {
    const reminders = await listReminders(db, {
        actor: { agentId: runner.agentId, kind: 'agent' },
        serverId: runner.serverId,
    });
    const filtered = statuses?.length
        ? reminders.filter((reminder) => statuses.includes(reminder.status))
        : reminders;
    return {
        reminders: await Promise.all(
            filtered.map((reminder) => toCliReminder(db, runner.serverId, reminder))
        ),
    };
}

export async function snoozeAgentReminder(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { by: string; commandId: string; expectedVersion: number; id: string }
) {
    await ownedReminder(db, runner, input.id);
    const result = await snoozeReminder(
        db,
        runner.agentId,
        commandInput(runner, input, { duration: input.by }),
        clock
    );
    return {
        reminder: await toCliReminder(db, runner.serverId, result.reminder),
        replayed: result.idempotent,
    };
}

export async function updateAgentReminder(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: {
        description?: string | null;
        fireAt?: string;
        commandId: string;
        expectedVersion: number;
        id: string;
        repeat?: string | null;
        script?: string | null;
        title?: string;
    }
) {
    await ownedReminder(db, runner, input.id);
    const result = await updateReminder(
        db,
        runner.agentId,
        commandInput(runner, input, {
            ...(input.fireAt ? { fireAt: new Date(input.fireAt) } : {}),
            ...('description' in input ? { description: input.description } : {}),
            ...('repeat' in input ? { repeat: input.repeat } : {}),
            ...('script' in input ? { script: input.script } : {}),
            ...(input.title ? { title: input.title } : {}),
        }),
        clock
    );
    return {
        reminder: await toCliReminder(db, runner.serverId, result.reminder),
        replayed: result.idempotent,
    };
}

export async function cancelAgentReminder(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { commandId: string; expectedVersion: number; id: string }
) {
    await ownedReminder(db, runner, input.id);
    const result = await cancelReminder(db, runner.agentId, commandInput(runner, input, {}), clock);
    return {
        reminder: await toCliReminder(db, runner.serverId, result.reminder),
        replayed: result.idempotent,
    };
}

export async function readAgentReminderLog(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { id?: string; limit: number }
) {
    const reminders = input.id
        ? [await ownedReminder(db, runner, input.id)]
        : await listReminders(db, {
              actor: { agentId: runner.agentId, kind: 'agent' },
              serverId: runner.serverId,
          });
    const fires = (
        await Promise.all(
            reminders.map((reminder) =>
                listReminderFires(db, {
                    actor: { agentId: runner.agentId, kind: 'agent' },
                    reminderId: reminder.id,
                    serverId: runner.serverId,
                })
            )
        )
    )
        .flat()
        .sort((left, right) => right.firedAt.localeCompare(left.firedAt))
        .slice(0, input.limit);
    return {
        runs: fires.map((fire) => ({
            firedAt: fire.firedAt,
            id: fire.id,
            outcome: fire.scriptTimedOut
                ? 'timed_out'
                : fire.scriptExitCode && fire.scriptExitCode !== 0
                  ? 'failed'
                  : 'fired',
            output: fire.scriptOutput ?? null,
            reminderId: fire.reminderId,
            scriptExitCode: fire.scriptExitCode ?? null,
        })),
    };
}

async function ownedReminder(db: HausDatabase, runner: ResolvedRunner, id: string) {
    const reminders = await listReminders(db, {
        actor: { agentId: runner.agentId, kind: 'agent' },
        serverId: runner.serverId,
    });
    const reminder = reminders.find((candidate) => candidate.id === id);
    if (!reminder) {
        throw new Error('The reminder is not owned by this Agent.');
    }
    return reminder;
}

function commandInput<Extra extends object>(
    runner: ResolvedRunner,
    input: { commandId: string; expectedVersion: number; id: string },
    extra: Extra
) {
    return {
        commandId: input.commandId,
        expectedVersion: input.expectedVersion,
        reminderId: input.id,
        serverId: runner.serverId,
        ...extra,
    };
}

async function toCliReminder(db: HausDatabase, serverId: string, reminder: Reminder) {
    return {
        anchorTarget: await targetForChat(db, serverId, reminder.anchorChatId),
        description: reminder.description,
        fireAt: reminder.fireAt,
        id: reminder.id,
        repeat: reminder.repeat,
        script: reminder.hasScript,
        status: reminder.status,
        title: reminder.title,
        timezone: reminder.timezone,
        version: reminder.version,
    };
}
