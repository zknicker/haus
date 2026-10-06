import type { Reminder } from '@haus/api';

const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
interface Cadence {
    frequency: string;
    time?: string;
}

/** Presentation only: Server fireAt remains authoritative, including off-slot first fires. */
export function formatReminderSchedule(
    reminder: Pick<Reminder, 'fireAt' | 'repeat' | 'timezone'>,
    viewerZone = Intl.DateTimeFormat().resolvedOptions().timeZone,
    locale?: string
): { text: string; title: string } {
    const date = new Date(reminder.fireAt);
    const cadence = describeCadence(reminder.repeat, locale);
    const frequency = cadence.time ? `${cadence.frequency} at ${cadence.time}` : cadence.frequency;
    const title = [reminder.timezone, reminder.repeat, `Your timezone: ${viewerZone}`]
        .filter(Boolean)
        .join(' · ');
    const prefix = reminder.repeat ? 'Next ' : '';
    try {
        const scheduled = formatDate(date, reminder.timezone, locale);
        const parts = [`${prefix}${scheduled}`, frequency, zoneLabel(reminder.timezone)];
        if (offsetAt(date, reminder.timezone) !== offsetAt(date, viewerZone)) {
            const sameDate = dayAt(date, reminder.timezone) === dayAt(date, viewerZone);
            const local = sameDate
                ? new Intl.DateTimeFormat(locale, {
                      hour: 'numeric',
                      minute: '2-digit',
                      timeZone: viewerZone,
                  }).format(date)
                : formatDate(date, viewerZone, locale);
            parts.push(`${local} your time`);
        }
        return { text: parts.join(' · '), title };
    } catch {
        // A malformed legacy zone must not turn a schedule into an unlabelled local clock.
        return {
            text: `${prefix}${formatDate(date, viewerZone, locale)} your time · ${cadence.frequency} · Schedule timezone unavailable`,
            title,
        };
    }
}

/** History has no schedule timezone: show frequency without an ambiguous clock time. */
export function formatReminderCadence(repeat: string | null, locale?: string): string {
    return describeCadence(repeat, locale).frequency;
}

function describeCadence(repeat: string | null, locale?: string): Cadence {
    if (!repeat) {
        return { frequency: 'Once' };
    }
    const interval = intervalLabel(repeat);
    if (interval) {
        return { frequency: interval };
    }
    const calendar = /^(daily|weekly:([a-z,]+))@(\d{2}):(\d{2})$/u.exec(repeat);
    if (!calendar) {
        return { frequency: repeat };
    }
    const hour = Number(calendar[3]);
    const minute = Number(calendar[4]);
    if (hour > 23 || minute > 59) {
        return { frequency: repeat };
    }
    const time = new Intl.DateTimeFormat(locale, {
        hour: 'numeric',
        minute: '2-digit',
        timeZone: 'UTC',
    }).format(new Date(Date.UTC(2000, 0, 1, hour, minute)));
    if (calendar[1] === 'daily') {
        return { frequency: 'Daily', time };
    }
    const days = [...new Set(calendar[2]?.split(',').map((day) => weekdays.indexOf(day)))].sort();
    if (days.length === 0 || days.includes(-1)) {
        return { frequency: repeat };
    }
    const names = days.map((day) =>
        new Intl.DateTimeFormat(locale, {
            weekday: days.length === 1 ? 'long' : 'short',
            timeZone: 'UTC',
        }).format(new Date(Date.UTC(2000, 0, 2 + day)))
    );
    return {
        frequency: `Every ${new Intl.ListFormat(locale, { type: 'conjunction' }).format(names)}`,
        time,
    };
}

function formatDate(date: Date, timeZone: string, locale?: string): string {
    return new Intl.DateTimeFormat(locale, {
        weekday: 'short',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        timeZone,
    }).format(date);
}

function offsetAt(date: Date, timeZone: string): string | undefined {
    return new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'longOffset' })
        .formatToParts(date)
        .find((part) => part.type === 'timeZoneName')?.value;
}

function dayAt(date: Date, timeZone: string): string {
    return new Intl.DateTimeFormat('en-US', {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        timeZone,
    }).format(date);
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
