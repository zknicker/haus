import { dayKey, daysBetween } from '../members/agent-profile/reminder-cadence.ts';

/**
 * How a time chip reads its instant: each viewer sees the moment in their own
 * saved zone, with the same day words reminders use.
 */
export interface TimeChipContext {
    locale?: string;
    now?: number;
    viewerZone: string;
}

export interface TimeChipZoneRow {
    /** "Your time · New York", "Pacific", "Eastern", "UTC". */
    label: string;
    /** "Friday, October 10 at 3:00 AM EDT". */
    time: string;
    zone: string;
}

/**
 * "Today at 3:00 PM EDT", "Tomorrow at 9:00 AM EDT", "Fri, Oct 10 at 3:00 AM EDT",
 * or a range "Today at 10:00 – 11:00 AM EDT".
 */
export function formatTimeChipLabel(instant: Date, context: TimeChipContext, end?: Date): string {
    const { locale, now = Date.now(), viewerZone } = context;
    const fireDay = dayKey(instant, viewerZone);
    const today = dayKey(new Date(now), viewerZone);
    const offset = daysBetween(today, fireDay);
    const day =
        Math.abs(offset) <= 1
            ? capitalize(
                  new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(offset, 'day')
              )
            : new Intl.DateTimeFormat(locale, {
                  day: 'numeric',
                  month: 'short',
                  timeZone: viewerZone,
                  weekday: 'short',
                  ...(fireDay.slice(0, 4) === today.slice(0, 4) ? {} : { year: 'numeric' }),
              }).format(instant);
    if (!end) {
        return `${day} at ${formatClock(instant, viewerZone, locale)}`;
    }
    return dayKey(end, viewerZone) === fireDay
        ? `${day} at ${clockFormat(viewerZone, locale).formatRange(instant, end)}`
        : `${day} at ${formatClock(instant, viewerZone, locale)} – ${formatTimeChipLabel(end, context)}`;
}

/**
 * The hover card's rows: the viewer's own zone first, then Pacific, Eastern,
 * and UTC, skipping whichever of those the viewer already lives in.
 */
export function timeChipZoneRows(
    instant: Date,
    context: TimeChipContext,
    end?: Date
): TimeChipZoneRow[] {
    const { locale, now = Date.now(), viewerZone } = context;
    const viewer = canonicalZone(viewerZone);
    const thisYear = dayKey(new Date(now), viewer).slice(0, 4);
    const rows = [
        { label: `Your time · ${zoneName(viewer)}`, zone: viewer },
        ...referenceZones.filter(({ zone }) => canonicalZone(zone) !== viewer),
    ];
    return rows.map(({ label, zone }) => ({
        label,
        time:
            formatFullTime(instant, zone, dayKey(instant, zone).slice(0, 4) !== thisYear, locale) +
            (end ? ` – ${formatClock(end, zone, locale)}` : ''),
        zone,
    }));
}

/**
 * "in 3 hours", "in 2 days", "5 days ago": how far the moment is from now.
 * Past a day it counts calendar days in the viewer zone, so a Saturday
 * moment read on Thursday afternoon is "in 2 days", matching its date.
 */
export function formatTimeFromNow(instant: Date, context: TimeChipContext) {
    const { locale, now = Date.now(), viewerZone } = context;
    const seconds = (instant.getTime() - now) / 1000;
    const format = new Intl.RelativeTimeFormat(locale, { numeric: 'always' });
    if (Math.abs(seconds) < 60) {
        return new Intl.RelativeTimeFormat(locale, { numeric: 'auto' }).format(0, 'second');
    }
    if (Math.abs(seconds) < 3600) {
        return format.format(Math.round(seconds / 60), 'minute');
    }
    if (Math.abs(seconds) < 86_400) {
        return format.format(Math.round(seconds / 3600), 'hour');
    }
    const days = daysBetween(dayKey(new Date(now), viewerZone), dayKey(instant, viewerZone));
    if (Math.abs(days) < 30) {
        return format.format(days, 'day');
    }
    return Math.abs(days) < 365
        ? format.format(Math.round(days / 30), 'month')
        : format.format(Math.round(days / 365), 'year');
}

const referenceZones = [
    { label: 'Pacific', zone: 'America/Los_Angeles' },
    { label: 'Eastern', zone: 'America/New_York' },
    { label: 'UTC', zone: 'UTC' },
] as const;

function formatClock(instant: Date, timeZone: string, locale?: string) {
    return clockFormat(timeZone, locale).format(instant);
}

function clockFormat(timeZone: string, locale?: string) {
    return new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone,
        timeZoneName: 'short',
    });
}

function formatFullTime(instant: Date, timeZone: string, withYear: boolean, locale?: string) {
    return new Intl.DateTimeFormat(locale, {
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        month: 'long',
        timeZone,
        timeZoneName: 'short',
        weekday: 'long',
        ...(withYear ? { year: 'numeric' } : {}),
    }).format(instant);
}

/** `Etc/UTC` and `UTC`, or a zone and its alias, compare equal. */
function canonicalZone(zone: string) {
    const resolved = new Intl.DateTimeFormat('en-US', { timeZone: zone }).resolvedOptions()
        .timeZone;
    return utcAliases.test(resolved) ? 'UTC' : resolved;
}

const utcAliases = /^(?:Etc\/)?(?:UTC|UCT|GMT0?|Universal|Zulu|Greenwich)$/u;

function zoneName(zone: string) {
    return zone.includes('/') ? (zone.split('/').at(-1)?.replaceAll('_', ' ') ?? zone) : zone;
}

function capitalize(value: string) {
    return value.charAt(0).toLocaleUpperCase() + value.slice(1);
}
