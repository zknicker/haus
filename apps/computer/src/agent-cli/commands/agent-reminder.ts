import { randomUUID } from 'node:crypto';
import type * as z from 'zod';
import { type AgentApiRequester, createAgentApiClient } from '../agent-api-client.ts';
import { AgentCliError } from '../agent-error.ts';
import { formatLocalTime } from '../agent-format.ts';
import type { ParsedArgs } from '../parse.ts';
import type { SubCommand } from '../subcommand.ts';
import {
    clip,
    describeReminder,
    normalizeClearable,
    type ReminderDeps,
    readReminderForMutation,
    reminderListSchema,
    reminderLogSchema,
    reminderSingleSchema,
    requireFlag,
} from './agent-reminder-view.ts';
import { isCalendarRepeat } from './reminder-cadence-label.ts';
import { reminderCommandIdFlag, scheduleCommandId } from './reminder-command-id.ts';
import {
    absoluteReminderFireAt,
    reminderScheduleTime,
    scheduleTimingFlags,
    updateTimingFlags,
} from './reminder-schedule-time.ts';
import {
    confirmUpdateTimezone,
    descriptionHelp,
    idFlag,
    reminderTimezoneFlag,
    scheduleTimezone,
    titleHelp,
    verifyScheduledTimezone,
} from './reminder-timezone.ts';

// Family 8 — Reminders (D4). Author-owned wake signals anchored to a
// message; the only scheduling primitive. `--script` payloads run locally at
// fire time: empty output is a quiet tick, output rides the fire.
export const REMINDER_SUBCOMMANDS: SubCommand[] = [
    {
        examples: [
            'haus reminder schedule --title "CI Check" --description "check if CI finished and update the task" --delay-seconds 1800 --message-id 1a2b3c4d',
            'haus reminder schedule --title "Monday Advertising Review" --description "check advertising and flag campaigns that need bid adjustments" --repeat weekly:mon@09:00 --timezone America/New_York --message-id 1a2b3c4d',
            "haus reminder schedule --title 'Nightly Export Watch' --delay-seconds 3600 --repeat every:1h --message-id 1a2b3c4d --script 'check-export --quiet-when-ok'",
        ],
        flags: [
            reminderCommandIdFlag,
            reminderTimezoneFlag,
            { description: titleHelp, name: '--title', valueName: '<label>' },
            { description: descriptionHelp, name: '--description', valueName: '<text>' },
            ...scheduleTimingFlags,
            {
                description: 'Anchor message id (msg= from a message you received or read)',
                name: '--message-id',
                valueName: '<id>',
            },
            {
                description:
                    'Local script at fire time: empty output = quiet tick, output wakes you',
                name: '--script',
                valueName: '<command>',
            },
        ],
        name: 'schedule',
        positionals: [],
        run: (args) => runReminderSchedule(args, defaultDeps()),
        summary: 'Schedule an author-owned wake signal anchored to a message',
        usage: 'haus reminder schedule --title <label> [--description <text>] (--delay-seconds <n> | --fire-at <iso>) [--repeat <cadence>] [--timezone <iana>] --message-id <id> [--script <command>]',
    },
    {
        examples: ['haus reminder list', 'haus reminder list --status scheduled'],
        flags: [
            {
                description: 'Filter: scheduled, fired, canceled (comma-separated)',
                name: '--status',
                valueName: '<statuses>',
            },
        ],
        name: 'list',
        positionals: [],
        run: (args) => runReminderList(args, defaultDeps()),
        summary: 'List your reminders',
        usage: 'haus reminder list [--status scheduled,fired,canceled]',
    },
    {
        examples: ['haus reminder snooze --id rem_1a2b3c4d5e6f --by 2h'],
        flags: [
            idFlag,
            { description: 'Push later by 30m, 2h, or 1d', name: '--by', valueName: '<duration>' },
        ],
        name: 'snooze',
        positionals: [],
        run: (args) => runReminderSnooze(args, defaultDeps()),
        summary: 'Push a reminder later instead of stacking duplicates',
        usage: 'haus reminder snooze --id <id> --by <30m|2h|1d>',
    },
    {
        examples: [
            'haus reminder update --id rem_1a2b3c4d5e6f --title "CI Check" --description "check CI and update task #3"',
        ],
        flags: [
            idFlag,
            reminderTimezoneFlag,
            { description: titleHelp, name: '--title', valueName: '<label>' },
            {
                description: `${descriptionHelp}, or "none" to remove it`,
                name: '--description',
                valueName: '<text>',
            },
            ...updateTimingFlags,
            {
                description: 'New script, or "none" to remove it',
                name: '--script',
                valueName: '<command>',
            },
        ],
        name: 'update',
        positionals: [],
        run: (args) => runReminderUpdate(args, defaultDeps()),
        summary: 'Change one thing about a reminder: its label, time, cadence, or script',
        usage: 'haus reminder update --id <id> (--title <label> [--description <text>] | --description <text> | --fire-at <iso> | --repeat <cadence> [--timezone <iana>] | --script <command>)',
    },
    {
        examples: ['haus reminder cancel --id rem_1a2b3c4d5e6f'],
        flags: [idFlag],
        name: 'cancel',
        positionals: [],
        run: (args) => runReminderCancel(args, defaultDeps()),
        summary: 'Cancel a reminder that is truly no longer needed',
        usage: 'haus reminder cancel --id <id>',
    },
    {
        examples: ['haus reminder log', 'haus reminder log --id rem_1a2b3c4d5e6f --limit 20'],
        flags: [
            idFlag,
            { description: 'Max runs to show (default 50)', name: '--limit', valueName: '<n>' },
        ],
        name: 'log',
        positionals: [],
        run: (args) => runReminderLog(args, defaultDeps()),
        summary: 'Read fire history, including quiet script ticks',
        usage: 'haus reminder log [--id <id>] [--limit <n>]',
    },
];

export async function runReminderSchedule(args: ParsedArgs, deps: ReminderDeps): Promise<number> {
    const title = args.values['--title'];
    const messageId = args.values['--message-id'];
    if (!title) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Provide --title with a short label, like "Monday Advertising Review".',
            { nextAction: 'Put the full instruction in --description.' }
        );
    }
    if (!messageId) {
        throw new AgentCliError('INVALID_ARG', 'Provide --message-id with the anchor message.', {
            nextAction: 'Use the msg= id from the message this follow-up is about.',
        });
    }
    const commandId = scheduleCommandId(args);
    const fireAt = reminderScheduleTime(args);
    const timezone = await scheduleTimezone(args, deps.client);
    const response = await requestReminderMutation(
        deps,
        '/api/agent/reminders/schedule',
        {
            body: {
                commandId: commandId ?? `cli-${randomUUID()}`,
                description: args.values['--description'],
                ...(fireAt ? { fireAt } : {}),
                messageId,
                repeat: args.values['--repeat'],
                script: args.values['--script'],
                title,
                ...(timezone ? { timezone } : {}),
            },
            method: 'POST',
        },
        reminderSingleSchema
    );
    verifyScheduledTimezone(timezone, response.reminder);
    deps.write(
        `${response.replayed ? 'Already applied; current state: ' : ''}${describeReminder(response.reminder)}${response.reminder.status === 'scheduled' ? `\nSnooze or cancel later: haus reminder snooze --id ${response.reminder.id} --by 2h` : ''}\n`
    );
    return 0;
}

export async function runReminderList(args: ParsedArgs, deps: ReminderDeps): Promise<number> {
    const status = args.values['--status'];
    const query = status ? `?status=${encodeURIComponent(status)}` : '';
    const response = await deps.client.request(`/api/agent/reminders${query}`, reminderListSchema, {
        method: 'GET',
    });
    if (response.reminders.length === 0) {
        deps.write(
            'No reminders. Schedule follow-up work with haus reminder schedule when progress depends on future state.\n'
        );
        return 0;
    }
    deps.write(`${response.reminders.map((row) => describeReminder(row)).join('\n')}\n`);
    return 0;
}

export async function runReminderSnooze(args: ParsedArgs, deps: ReminderDeps): Promise<number> {
    const current = await readReminderForMutation(deps, requireFlag(args, '--id'));
    const response = await requestReminderMutation(
        deps,
        '/api/agent/reminders/snooze',
        {
            body: {
                by: requireFlag(args, '--by'),
                commandId: `cli-${randomUUID()}`,
                expectedVersion: current.version,
                id: current.id,
            },
            method: 'POST',
        },
        reminderSingleSchema
    );
    deps.write(
        `Snoozed. ${response.replayed ? 'Already applied; current state: ' : ''}${describeReminder(response.reminder)}\n`
    );
    return 0;
}

export async function runReminderUpdate(args: ParsedArgs, deps: ReminderDeps): Promise<number> {
    const id = requireFlag(args, '--id');
    const fields = {
        description: normalizeClearable(args.values['--description']),
        fireAt: args.values['--fire-at']
            ? absoluteReminderFireAt(args.values['--fire-at'])
            : undefined,
        repeat: normalizeClearable(args.values['--repeat']),
        script: normalizeClearable(args.values['--script']),
        title: args.values['--title'],
    };
    // The title and description are one label, so they may change together.
    const provided = [
        fields.title ?? fields.description,
        fields.fireAt,
        fields.repeat,
        fields.script,
    ];
    if (provided.filter((value) => value !== undefined).length !== 1) {
        throw new AgentCliError(
            'INVALID_ARG',
            'Update one thing: --title and/or --description, --fire-at, --repeat, or --script.'
        );
    }
    const current = await readReminderForMutation(deps, id);
    confirmUpdateTimezone(args, current, fields.repeat);
    const response = await requestReminderMutation(
        deps,
        '/api/agent/reminders/update',
        {
            body: {
                commandId: `cli-${randomUUID()}`,
                expectedVersion: current.version,
                id,
                ...fields,
            },
            method: 'POST',
        },
        reminderSingleSchema
    );
    if (isCalendarRepeat(fields.repeat)) {
        verifyScheduledTimezone(current.timezone, response.reminder);
    }
    deps.write(
        `Updated. ${response.replayed ? 'Already applied; current state: ' : ''}${describeReminder(response.reminder)}\n`
    );
    return 0;
}

export async function runReminderCancel(args: ParsedArgs, deps: ReminderDeps): Promise<number> {
    const current = await readReminderForMutation(deps, requireFlag(args, '--id'));
    const response = await requestReminderMutation(
        deps,
        '/api/agent/reminders/cancel',
        {
            body: {
                commandId: `cli-${randomUUID()}`,
                expectedVersion: current.version,
                id: current.id,
            },
            method: 'POST',
        },
        reminderSingleSchema
    );
    deps.write(
        `${response.replayed ? `Already applied; current state: ${describeReminder(response.reminder)}` : `Canceled reminder ${response.reminder.id} ("${response.reminder.title}").`}\n`
    );
    return 0;
}

export async function runReminderLog(args: ParsedArgs, deps: ReminderDeps): Promise<number> {
    const params = new URLSearchParams();
    const id = args.values['--id'];
    const limit = args.values['--limit'];
    if (id) {
        params.set('id', id);
    }
    if (limit) {
        params.set('limit', limit);
    }
    const query = params.size > 0 ? `?${params.toString()}` : '';
    const response = await deps.client.request(
        `/api/agent/reminders/log${query}`,
        reminderLogSchema,
        { method: 'GET' }
    );
    if (response.runs.length === 0) {
        deps.write('No reminder fires recorded yet.\n');
        return 0;
    }
    const lines = response.runs.map((run) => {
        const exit = run.scriptExitCode === null ? '' : ` exit=${run.scriptExitCode}`;
        const output = run.output ? ` — ${clip(run.output)}` : '';
        return `${formatLocalTime(run.firedAt)} ${run.reminderId} [${run.outcome}]${exit}${output}`;
    });
    deps.write(`${lines.join('\n')}\n`);
    return 0;
}

async function requestReminderMutation<T>(
    deps: ReminderDeps,
    route: string,
    input: Parameters<AgentApiRequester['request']>[2],
    schema: z.ZodType<T>
): Promise<T> {
    try {
        return await deps.client.request(route, schema, input);
    } catch (cause) {
        if (!(cause instanceof AgentCliError) || cause.code !== 'SERVER_5XX') {
            throw cause;
        }
        return await deps.client.request(route, schema, input);
    }
}

function defaultDeps(): ReminderDeps {
    return {
        client: createAgentApiClient(),
        write: (text) => process.stdout.write(text),
    };
}
