import * as z from 'zod';
import { AgentCliError } from '../agent-error.ts';
import type { ParsedArgs } from '../parse.ts';

export function absoluteReminderFireAt(value: string): string {
    const zoned = value.trim().replace(/([+-]\d{2})(\d{2})$/u, '$1:$2');
    if (!z.iso.datetime({ offset: true }).safeParse(zoned).success) {
        throw new AgentCliError('INVALID_ARG', 'Use --fire-at with a zoned ISO timestamp.', {
            nextAction: 'Include Z or an explicit offset, for example 2026-10-06T09:00:00-04:00.',
        });
    }
    return new Date(zoned).toISOString();
}

export function reminderScheduleTime(args: ParsedArgs): string {
    const raw = args.values['--delay-seconds'];
    const delay = raw === undefined ? undefined : Number(raw);
    if (delay !== undefined && (!Number.isInteger(delay) || delay < 1)) {
        throw new AgentCliError('INVALID_ARG', `Invalid --delay-seconds "${raw}".`);
    }
    const absolute = args.values['--fire-at'];
    if (Boolean(delay) === Boolean(absolute)) {
        throw new AgentCliError('INVALID_ARG', 'Pass exactly one of --delay-seconds or --fire-at.');
    }
    return absolute
        ? absoluteReminderFireAt(absolute)
        : new Date(Date.now() + (delay ?? 0) * 1000).toISOString();
}
