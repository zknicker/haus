import type { ResolvedRunner } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentCanAccessAnchor } from '../reminders/reminder-model.ts';
import type { AuthorReminder } from '../reminders/reminders.ts';
import {
    cancelReminder,
    listReminderFires,
    listReminders,
    readOwnedReminder,
    scheduleReminder,
    snoozeReminder,
    updateReminder,
} from '../reminders/reminders.ts';
import { resolveAgentMessage } from './message-read.ts';
import { targetForChat } from './message-view.ts';

const clock = { now: () => new Date() };

const ANCHOR_NOT_ACCESSIBLE = 'anchor not accessible';

export async function scheduleAgentReminder(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: {
        commandId: string;
        description?: string;
        failAfter?: number;
        fireAt?: string;
        messageId: string;
        repeat?: string;
        script?: string;
        title: string;
        timezone?: string;
        wakeOnChange?: boolean;
    }
) {
    const anchor = await resolveAgentMessage(db, runner, input.messageId);
    const fireAt = input.fireAt === undefined ? undefined : new Date(input.fireAt);
    const result = await scheduleReminder(
        db,
        runner.agentId,
        {
            anchorChatId: anchor.chat_id,
            anchorMessageId: anchor.id,
            commandId: input.commandId,
            description: input.description,
            failAfter: input.failAfter,
            fireAt,
            repeat: input.repeat,
            script: input.script,
            serverId: runner.serverId,
            title: input.title,
            timezone: input.timezone,
            wakeOnChange: input.wakeOnChange,
        },
        clock
    );
    return {
        reminder: await toCliReminder(db, runner.serverId, {
            ...result.reminder,
            anchorAccessible: true,
        }),
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
    await readOwnedReminder(db, {
        agentId: runner.agentId,
        reminderId: input.id,
        serverId: runner.serverId,
    });
    const result = await snoozeReminder(
        db,
        runner.agentId,
        commandInput(runner, input, { duration: input.by }),
        clock
    );
    return {
        reminder: await toCliReminder(db, runner.serverId, {
            ...result.reminder,
            anchorAccessible: true,
        }),
        replayed: result.idempotent,
    };
}

export async function updateAgentReminder(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: {
        description?: string | null;
        failAfter?: number | null;
        fireAt?: string;
        commandId: string;
        expectedVersion: number;
        id: string;
        repeat?: string | null;
        script?: string | null;
        title?: string;
        wakeOnChange?: boolean;
    }
) {
    await readOwnedReminder(db, {
        agentId: runner.agentId,
        reminderId: input.id,
        serverId: runner.serverId,
    });
    const result = await updateReminder(
        db,
        runner.agentId,
        commandInput(runner, input, {
            ...(input.fireAt ? { fireAt: new Date(input.fireAt) } : {}),
            ...('description' in input ? { description: input.description } : {}),
            ...('repeat' in input ? { repeat: input.repeat } : {}),
            ...('script' in input ? { script: input.script } : {}),
            ...(input.title ? { title: input.title } : {}),
            ...('failAfter' in input ? { failAfter: input.failAfter } : {}),
            ...('wakeOnChange' in input ? { wakeOnChange: input.wakeOnChange } : {}),
        }),
        clock
    );
    return {
        reminder: await toCliReminder(db, runner.serverId, {
            ...result.reminder,
            anchorAccessible: true,
        }),
        replayed: result.idempotent,
    };
}

export async function cancelAgentReminder(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { commandId: string; expectedVersion: number; id: string }
) {
    await readOwnedReminder(db, {
        agentId: runner.agentId,
        reminderId: input.id,
        serverId: runner.serverId,
    });
    const result = await cancelReminder(db, runner.agentId, commandInput(runner, input, {}), clock);
    const anchorAccessible = await agentCanAccessAnchor(db, {
        agentId: runner.agentId,
        anchorChatId: result.reminder.anchorChatId,
        anchorMessageId: result.reminder.anchorMessageId,
        serverId: runner.serverId,
    });
    return {
        reminder: await toCliReminder(db, runner.serverId, {
            ...result.reminder,
            anchorAccessible,
        }),
        replayed: result.idempotent,
    };
}

const reminderLogWindows = [
    ['24h', 24 * 60 * 60 * 1000],
    ['7d', 7 * 24 * 60 * 60 * 1000],
    ['30d', 30 * 24 * 60 * 60 * 1000],
] as const;

export async function readAgentReminderLog(
    db: HausDatabase,
    runner: ResolvedRunner,
    input: { id?: string; limit: number }
) {
    const reminders = input.id
        ? [await visibleOwnedReminder(db, runner, input.id)]
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
        .sort((left, right) => right.firedAt.localeCompare(left.firedAt));
    const now = Date.now();
    return {
        runs: fires.slice(0, input.limit).map((fire) => ({
            durationMs: fire.durationMs ?? null,
            firedAt: fire.firedAt,
            id: fire.id,
            outcome: fire.outcome ?? 'woke',
            output: fire.scriptOutput ?? null,
            reminderId: fire.reminderId,
            scriptExitCode: fire.scriptExitCode ?? null,
        })),
        summary: Object.fromEntries(
            reminderLogWindows.map(([label, windowMs]) => [
                label,
                summarizeReminderLogWindow(
                    fires.filter((fire) => now - Date.parse(fire.firedAt) <= windowMs)
                ),
            ])
        ) as Record<
            (typeof reminderLogWindows)[number][0],
            ReturnType<typeof summarizeReminderLogWindow>
        >,
    };
}

function summarizeReminderLogWindow(
    fires: { outcome?: string | null; wakeTotalTokens?: number | null }[]
) {
    const counts = { failed: 0, quiet: 0, recovered: 0, unchanged: 0, woke: 0 };
    let tokens = 0;
    for (const fire of fires) {
        const outcome = fire.outcome ?? 'woke';
        if (outcome in counts) {
            counts[outcome as keyof typeof counts] += 1;
        }
        tokens += fire.wakeTotalTokens ?? 0;
    }
    return { ...counts, runs: fires.length, tokens };
}

async function visibleOwnedReminder(
    db: HausDatabase,
    runner: ResolvedRunner,
    id: string
): Promise<AuthorReminder> {
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

async function toCliReminder(db: HausDatabase, serverId: string, reminder: AuthorReminder) {
    return {
        anchorTarget: reminder.anchorAccessible
            ? await targetForChat(db, serverId, reminder.anchorChatId)
            : ANCHOR_NOT_ACCESSIBLE,
        description: reminder.description,
        failAfter: reminder.failAfter,
        fireAt: reminder.fireAt,
        id: reminder.id,
        repeat: reminder.repeat,
        script: reminder.hasScript,
        status: reminder.status,
        title: reminder.title,
        timezone: reminder.timezone,
        version: reminder.version,
        wakeOnChange: reminder.wakeOnChange,
    };
}
