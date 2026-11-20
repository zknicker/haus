import * as z from 'zod';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';
import { isCalendarRepeat } from './reminder-cadence-label.ts';

/** Timing flags for schedule: a calendar repeat needs neither delay nor fire time. */
export const scheduleTimingFlags = [
    { description: 'Fire after N seconds from now', name: '--delay-seconds', valueName: '<n>' },
    {
        description: 'Fire at a zoned ISO timestamp; for daily@/weekly: it must be a slot',
        name: '--fire-at',
        valueName: '<iso>',
    },
    {
        description:
            'Recurring cadence: every:15m|every:2h|every:1d|daily@09:00|weekly:mon,fri@09:00; daily@/weekly: start at the next slot',
        name: '--repeat',
        valueName: '<cadence>',
    },
];

/** Timing flags for update: a calendar reminder stays on its cadence's slots. */
export const updateTimingFlags = [
    {
        description: 'New fire time (ISO); a slot of the cadence for daily@/weekly:',
        name: '--fire-at',
        valueName: '<iso>',
    },
    {
        description:
            'New cadence, or "none" to stop repeating; daily@/weekly: move the next fire to its next slot',
        name: '--repeat',
        valueName: '<cadence>',
    },
];

export function absoluteReminderFireAt(value: string): string {
    const zoned = value.trim().replace(/([+-]\d{2})(\d{2})$/u, '$1:$2');
    if (!z.iso.datetime({ offset: true }).safeParse(zoned).success) {
        throw new AgentCliError('INVALID_ARG', 'Use --fire-at with a zoned ISO timestamp.', {
            nextAction: 'Include Z or an explicit offset, for example 2026-10-06T09:00:00-04:00.',
        });
    }
    return new Date(zoned).toISOString();
}

/**
 * The first fire to send. A calendar repeat sends none by default: the Server
 * starts it at the cadence's next slot in its zone, and refuses a --fire-at
 * that is not on one.
 */
export function reminderScheduleTime(args: ParsedArgs): string | undefined {
    const raw = args.values['--delay-seconds'];
    const delay = raw === undefined ? undefined : Number(raw);
    if (delay !== undefined && (!Number.isInteger(delay) || delay < 1)) {
        throw new AgentCliError('INVALID_ARG', `Invalid --delay-seconds "${raw}".`);
    }
    const absolute = args.values['--fire-at'];
    if (isCalendarRepeat(args.values['--repeat'])) {
        if (delay !== undefined) {
            throw new AgentCliError(
                'INVALID_ARG',
                'A calendar repeat starts at its next slot; drop --delay-seconds.',
                { nextAction: 'Omit timing flags, or pass --fire-at with an exact slot.' }
            );
        }
        return absolute ? absoluteReminderFireAt(absolute) : undefined;
    }
    if (Boolean(delay) === Boolean(absolute)) {
        throw new AgentCliError('INVALID_ARG', 'Pass exactly one of --delay-seconds or --fire-at.');
    }
    return absolute
        ? absoluteReminderFireAt(absolute)
        : new Date(Date.now() + (delay ?? 0) * 1000).toISOString();
}
