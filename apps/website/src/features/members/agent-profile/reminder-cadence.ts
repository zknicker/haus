/**
 * A Reminder's `repeat` grammar, parsed once and phrased for a person. Calendar
 * cadences (`daily@HH:MM`, `weekly:mon,wed@HH:MM`) are wall-clock promises in
 * the Reminder's own timezone; fixed intervals (`every:N[mhd]`) are durations
 * and never gain a clock time.
 */
export type ReminderCadence =
    | { kind: 'calendar'; hour: number; minute: number; weekdays: readonly number[] | null }
    | { kind: 'interval'; label: string }
    | { kind: 'unknown'; repeat: string };

const weekdayCodes = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

export function parseReminderCadence(repeat: string): ReminderCadence {
    const interval = intervalLabel(repeat);
    if (interval) {
        return { kind: 'interval', label: interval };
    }
    const calendar = /^(daily|weekly:([a-z,]+))@(\d{2}):(\d{2})$/u.exec(repeat);
    const hour = Number(calendar?.[3]);
    const minute = Number(calendar?.[4]);
    if (!calendar || hour > 23 || minute > 59) {
        return { kind: 'unknown', repeat };
    }
    if (calendar[1] === 'daily') {
        return { hour, kind: 'calendar', minute, weekdays: null };
    }
    const weekdays = [...new Set(calendar[2]?.split(',').map((day) => weekdayCodes.indexOf(day)))];
    if (weekdays.length === 0 || weekdays.includes(-1)) {
        return { kind: 'unknown', repeat };
    }
    return { hour, kind: 'calendar', minute, weekdays: weekdays.sort() };
}

/**
 * "Every Monday at 3:57 PM", with the slot moved into the viewer's zone. The
 * slot is converted on the date of the next fire, so DST and a slot that lands
 * on another calendar day for the viewer (Monday 9 AM New York is Monday 10 PM
 * Tokyo; Monday 9 PM New York is Tuesday morning there) both come out right.
 * An unknown schedule zone leaves the slot exactly as written.
 */
export function formatViewerCadence(
    repeat: string,
    reference: { fireAt: string; timezone: string },
    viewerZone: string,
    locale?: string
): string {
    const cadence = parseReminderCadence(repeat);
    if (cadence.kind === 'interval') {
        return cadence.label;
    }
    if (cadence.kind === 'unknown') {
        return cadence.repeat;
    }
    const slot = viewerSlot(cadence, reference, viewerZone, locale);
    const days = cadence.weekdays?.map((day) => (day + slot.dayShift + 7) % 7);
    return `${frequency(days ?? null, locale)} at ${slot.time}`;
}

/** History has no schedule timezone: frequency only, without an ambiguous clock time. */
export function formatReminderCadence(repeat: string | null, locale?: string): string {
    if (!repeat) {
        return 'Once';
    }
    const cadence = parseReminderCadence(repeat);
    if (cadence.kind === 'interval') {
        return cadence.label;
    }
    return cadence.kind === 'calendar' ? frequency(cadence.weekdays, locale) : cadence.repeat;
}

export function isKnownTimeZone(zone: string): boolean {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: zone });
        return true;
    } catch {
        return false;
    }
}

/** A calendar day as a sortable `YYYY-MM-DD` key in one zone. */
export function dayKey(date: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        month: '2-digit',
        timeZone,
        year: 'numeric',
    }).formatToParts(date);
    const part = (type: string) => parts.find((candidate) => candidate.type === type)?.value;
    return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Whole calendar days from one `dayKey` to another. */
export function daysBetween(from: string, to: string): number {
    return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

function viewerSlot(
    cadence: Extract<ReminderCadence, { kind: 'calendar' }>,
    reference: { fireAt: string; timezone: string },
    viewerZone: string,
    locale?: string
): { dayShift: number; time: string } {
    const zone = isKnownTimeZone(reference.timezone) ? reference.timezone : null;
    const [year, month, day] = dayKey(new Date(reference.fireAt), zone ?? 'UTC')
        .split('-')
        .map(Number);
    const wall = Date.UTC(year ?? 2000, (month ?? 1) - 1, day ?? 1, cadence.hour, cadence.minute);
    const instant = zone ? zonedInstant(wall, zone) : new Date(wall);
    const shown = zone ? viewerZone : 'UTC';
    return {
        dayShift: daysBetween(dayKey(instant, zone ?? 'UTC'), dayKey(instant, shown)),
        time: new Intl.DateTimeFormat(locale, {
            hour: 'numeric',
            minute: '2-digit',
            timeZone: shown,
        }).format(instant),
    };
}

/** The instant a zone's wall clock reads `wall` (a UTC-encoded wall time). */
function zonedInstant(wall: number, timeZone: string): Date {
    const first = wall - offsetMinutes(new Date(wall), timeZone) * 60_000;
    // A second pass settles the offset when the first guess crossed a DST edge.
    return new Date(wall - offsetMinutes(new Date(first), timeZone) * 60_000);
}

function offsetMinutes(date: Date, timeZone: string): number {
    const name =
        new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
            .formatToParts(date)
            .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
    const match = /GMT([+-])(\d{2}):(\d{2})/u.exec(name);
    if (!match) {
        return 0;
    }
    const minutes = Number(match[2]) * 60 + Number(match[3]);
    return match[1] === '-' ? -minutes : minutes;
}

function frequency(weekdays: readonly number[] | null, locale?: string): string {
    if (!weekdays) {
        return 'Daily';
    }
    const sorted = [...weekdays].sort();
    const names = sorted.map((day) =>
        new Intl.DateTimeFormat(locale, {
            timeZone: 'UTC',
            weekday: sorted.length === 1 ? 'long' : 'short',
        }).format(new Date(Date.UTC(2000, 0, 2 + day)))
    );
    return `Every ${new Intl.ListFormat(locale, { type: 'conjunction' }).format(names)}`;
}

function intervalLabel(repeat: string): string | null {
    const interval = /^every:(\d+)([mhd])$/u.exec(repeat);
    if (!interval) {
        return null;
    }
    const amount = Number(interval[1]);
    const unit = interval[2] === 'm' ? 'minute' : interval[2] === 'h' ? 'hour' : 'day';
    const milliseconds =
        interval[2] === 'm' ? 60_000 : interval[2] === 'h' ? 3_600_000 : 86_400_000;
    return amount >= 1 && Number.isSafeInteger(amount * milliseconds)
        ? `Every ${amount} ${unit}${amount === 1 ? '' : 's'}`
        : null;
}
