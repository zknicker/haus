import { canonicalIanaTimezone } from '@haus/api';
import {
    isValidReminderTimezone,
    nextReminderFireAt,
    parseReminderRepeat,
    type ReminderRepeat,
} from './cadence.ts';

type CalendarRepeat = Exclude<ReminderRepeat, { kind: 'every' }>;

/**
 * The zone and first fire a new reminder stores. A calendar repeat (`daily@`,
 * `weekly:`) is a wall-clock agreement, so it names its zone and its first fire
 * is a slot of that cadence: derived from now when omitted, refused when
 * supplied off-slot. One-shots and `every:` intervals keep their explicit
 * instant and store the Agent's home zone when none is given.
 */
export function resolveScheduleTiming(
    input: { fireAt?: Date; timezone?: string },
    repeat: ReminderRepeat | null,
    context: { homeTimezone: string; now: Date }
): { fireAt: Date; timezone: string } {
    if (repeat && isCalendarRepeat(repeat)) {
        if (input.timezone === undefined) {
            throw new Error(
                `A ${repeat.spec} reminder needs an explicit IANA timezone: the zone of the person it is for.`
            );
        }
        const timezone = explicitTimezone(input.timezone);
        if (input.fireAt === undefined) {
            return {
                fireAt: new Date(nextReminderFireAt(repeat, context.now.getTime(), timezone)),
                timezone,
            };
        }
        requireCadenceSlot(repeat, input.fireAt, timezone);
        return { fireAt: input.fireAt, timezone };
    }
    if (input.fireAt === undefined) {
        throw new Error(
            'Provide fireAt for a one-shot or every: reminder; only daily@ and weekly: repeats derive their first fire.'
        );
    }
    return {
        fireAt: input.fireAt,
        timezone:
            input.timezone === undefined
                ? homeTimezone(context.homeTimezone)
                : explicitTimezone(input.timezone),
    };
}

/**
 * An update keeps a calendar reminder on its cadence: a new fire time must be a
 * slot of the cadence the reminder will have, and a new calendar repeat with no
 * fire time moves the next fire to that cadence's next slot from now. Snooze is
 * the one deliberate off-slot fire and never comes through here.
 */
export function alignUpdateToCadence<Values extends { fireAt?: Date; repeat?: string | null }>(
    values: Values,
    reminder: { repeat: string | null; timezone: string },
    now: Date
): Values {
    const spec = values.repeat === undefined ? reminder.repeat : values.repeat;
    const repeat = spec ? parseReminderRepeat(spec) : null;
    if (!(repeat && isCalendarRepeat(repeat))) {
        return values;
    }
    if (values.fireAt) {
        requireCadenceSlot(repeat, values.fireAt, reminder.timezone);
        return values;
    }
    if (values.repeat === undefined) {
        return values;
    }
    return {
        ...values,
        fireAt: new Date(nextReminderFireAt(repeat, now.getTime(), reminder.timezone)),
    };
}

function isCalendarRepeat(repeat: ReminderRepeat): repeat is CalendarRepeat {
    return repeat.kind !== 'every';
}

function requireCadenceSlot(repeat: CalendarRepeat, fireAt: Date, timezone: string) {
    const fireAtMs = fireAt.getTime();
    if (!Number.isFinite(fireAtMs)) {
        throw new Error('Reminder fire time must be a valid instant.');
    }
    if (nextReminderFireAt(repeat, fireAtMs - 1, timezone) !== fireAtMs) {
        const slot = new Date(nextReminderFireAt(repeat, fireAtMs, timezone)).toISOString();
        throw new Error(
            `The first fire ${fireAt.toISOString()} is not a ${repeat.spec} slot in ${timezone}. Omit the fire time to start at the next slot, or use a slot such as ${slot}.`
        );
    }
}

/** An Agent-supplied zone must be a canonical IANA name; offsets carry no DST rule. */
function explicitTimezone(timezone: string): string {
    const canonical = canonicalIanaTimezone(timezone);
    if (canonical === null) {
        throw new Error(
            'Provide a valid IANA timezone for the reminder, such as America/New_York or UTC.'
        );
    }
    return canonical;
}

function homeTimezone(timezone: string): string {
    if (!isValidReminderTimezone(timezone)) {
        throw new Error('Provide a valid IANA timezone for the reminder.');
    }
    return timezone;
}
