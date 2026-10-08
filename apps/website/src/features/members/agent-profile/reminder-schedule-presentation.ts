import type { Reminder } from '@haus/api';
import { dayKey, daysBetween, formatViewerCadence, isKnownTimeZone } from './reminder-cadence.ts';

/**
 * A Reminder is one of two things — it runs once, or it repeats — and every
 * surface states which before anything else. Presentation only: the Server's
 * `fireAt` stays authoritative, including an off-slot first fire.
 */
export type ReminderKind = 'once' | 'recurring';

type ScheduleFields = Pick<Reminder, 'fireAt' | 'repeat' | 'timezone'>;

export interface ScheduleContext {
    locale?: string;
    now?: number;
    viewerZone?: string;
}

export function reminderKind(reminder: Pick<Reminder, 'repeat'>): ReminderKind {
    return reminder.repeat ? 'recurring' : 'once';
}

export function reminderKindLabel(kind: ReminderKind): string {
    return kind === 'once' ? 'One-time reminder' : 'Recurring reminder';
}

/**
 * The row's one line, in the viewer's own time:
 * "Once · Tomorrow at 9:00 AM" or "Every Monday at 3:57 PM · Next run Mon, Oct 12".
 * A recurring row names the next run's clock only when the cadence does not
 * already say it — an interval has no clock, and an off-slot first fire has a
 * different one.
 */
export function formatReminderRowSummary(
    reminder: ScheduleFields,
    context: ScheduleContext = {}
): string {
    const { locale, now, viewerZone } = resolveContext(context);
    const fire = new Date(reminder.fireAt);
    const time = formatClock(fire, viewerZone, locale);
    if (!reminder.repeat) {
        return `Once · ${capitalize(dayPhrase(fire, now, viewerZone, locale))} at ${time}`;
    }
    const cadence = formatViewerCadence(reminder.repeat, reminder, viewerZone, locale);
    const day = dayPhrase(fire, now, viewerZone, locale);
    const next = cadence.endsWith(` at ${time}`) ? day : `${day} at ${time}`;
    return `${cadence} · Next run ${next}`;
}

export interface ReminderScheduleDetail {
    /** When it runs next, in the viewer's time. */
    nextRun: string;
    /** "Doesn't repeat", or the cadence in the viewer's time. */
    repeats: string;
    /** The schedule's own zone, and the next run's clock there when it differs. */
    timezone: string;
}

/** The detail sheet's Schedule rows. This is where the schedule's own zone lives. */
export function formatReminderScheduleDetail(
    reminder: ScheduleFields,
    context: ScheduleContext = {}
): ReminderScheduleDetail {
    const { locale, now, viewerZone } = resolveContext(context);
    const fire = new Date(reminder.fireAt);
    return {
        nextRun: `${capitalize(dayPhrase(fire, now, viewerZone, locale, true))} at ${formatClock(fire, viewerZone, locale)}`,
        repeats: reminder.repeat
            ? formatViewerCadence(reminder.repeat, reminder, viewerZone, locale)
            : "Doesn't repeat",
        timezone: timezoneLine(fire, reminder.timezone, viewerZone, locale),
    };
}

function resolveContext(context: ScheduleContext) {
    return {
        locale: context.locale,
        now: context.now ?? Date.now(),
        viewerZone: context.viewerZone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    };
}

function timezoneLine(fire: Date, zone: string, viewerZone: string, locale?: string): string {
    if (!isKnownTimeZone(zone)) {
        return `${zone} · Unrecognized timezone`;
    }
    const label = zoneLabel(zone);
    if (offsetName(fire, zone) === offsetName(fire, viewerZone)) {
        return `${label} · Same as yours`;
    }
    const sameDay = dayKey(fire, zone) === dayKey(fire, viewerZone);
    const there = new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: zone,
        ...(sameDay ? {} : { weekday: 'short' }),
    }).format(fire);
    return `${label} · ${there} there`;
}

/**
 * "today", "tomorrow", "yesterday" (a wake still waiting on an offline Agent),
 * otherwise the date — with its year only when it is not this year, unless the
 * caller wants the full date.
 */
function dayPhrase(
    fire: Date,
    now: number,
    viewerZone: string,
    locale: string | undefined,
    fullDate = false
): string {
    const fireDay = dayKey(fire, viewerZone);
    const today = dayKey(new Date(now), viewerZone);
    const offset = daysBetween(today, fireDay);
    if (!fullDate && Math.abs(offset) <= 1) {
        return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(offset, 'day');
    }
    return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        month: 'short',
        timeZone: viewerZone,
        weekday: 'short',
        ...(fullDate || fireDay.slice(0, 4) !== today.slice(0, 4) ? { year: 'numeric' } : {}),
    }).format(fire);
}

function formatClock(date: Date, timeZone: string, locale?: string): string {
    return new Intl.DateTimeFormat(locale, { hour: 'numeric', minute: '2-digit', timeZone }).format(
        date
    );
}

function offsetName(date: Date, timeZone: string): string | undefined {
    return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
        .formatToParts(date)
        .find((part) => part.type === 'timeZoneName')?.value;
}

function zoneLabel(zone: string): string {
    if (
        /^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific)\//u.test(
            zone
        )
    ) {
        return `${zone.split('/').at(-1)?.replaceAll('_', ' ')} time`;
    }
    return zone;
}

function capitalize(value: string): string {
    return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
