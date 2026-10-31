const weekdays = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export type ReminderRepeat =
    | { intervalMs: number; kind: 'every'; spec: string }
    | { hour: number; kind: 'daily'; minute: number; spec: string }
    | { days: number[]; hour: number; kind: 'weekly'; minute: number; spec: string };

export function parseReminderRepeat(spec: string): ReminderRepeat | null {
    const every = /^every:(\d+)([mhd])$/u.exec(spec);
    if (every?.[1] && every[2]) {
        const amount = Number(every[1]);
        if (!(Number.isSafeInteger(amount) && amount >= 1)) {
            return null;
        }
        const unitMs = every[2] === 'm' ? 60_000 : every[2] === 'h' ? 3_600_000 : 86_400_000;
        const intervalMs = amount * unitMs;
        return Number.isSafeInteger(intervalMs) ? { intervalMs, kind: 'every', spec } : null;
    }

    const daily = /^daily@(\d{2}):(\d{2})$/u.exec(spec);
    if (daily?.[1] && daily[2]) {
        const time = parseTime(daily[1], daily[2]);
        return time ? { ...time, kind: 'daily', spec } : null;
    }

    const weekly = /^weekly:([a-z,]+)@(\d{2}):(\d{2})$/u.exec(spec);
    if (!(weekly?.[1] && weekly[2] && weekly[3])) {
        return null;
    }
    const time = parseTime(weekly[2], weekly[3]);
    const days = [
        ...new Set(
            weekly[1].split(',').map((day) => weekdays.indexOf(day as (typeof weekdays)[number]))
        ),
    ].sort((left, right) => left - right);
    if (!time || days.length === 0 || days.includes(-1)) {
        return null;
    }
    const daySpec = days.map((day) => weekdays[day]).join(',');
    return {
        days,
        ...time,
        kind: 'weekly',
        spec: `weekly:${daySpec}@${weekly[2]}:${weekly[3]}`,
    };
}

export function parseReminderSnooze(value: string): number | null {
    const match = /^(\d+)([mhd])$/u.exec(value);
    if (!(match?.[1] && match[2])) {
        return null;
    }
    const amount = Number(match[1]);
    if (!(Number.isSafeInteger(amount) && amount >= 1)) {
        return null;
    }
    const unitMs = match[2] === 'm' ? 60_000 : match[2] === 'h' ? 3_600_000 : 86_400_000;
    const intervalMs = amount * unitMs;
    return Number.isSafeInteger(intervalMs) ? intervalMs : null;
}

export function nextReminderFireAt(
    repeat: ReminderRepeat,
    afterMs: number,
    timezone: string
): number {
    if (repeat.kind === 'every') {
        const candidate = afterMs + repeat.intervalMs;
        if (!Number.isFinite(new Date(candidate).getTime())) {
            throw new Error('Reminder recurrence exceeds the supported date range.');
        }
        return candidate;
    }

    const acceptedDays = repeat.kind === 'daily' ? [0, 1, 2, 3, 4, 5, 6] : repeat.days;
    const local = wallClockParts(new Date(afterMs), timezone);
    for (let offset = 0; offset <= 8; offset++) {
        const date = new Date(Date.UTC(local.year, local.month - 1, local.day + offset));
        if (!acceptedDays.includes(date.getUTCDay())) {
            continue;
        }
        const candidate = epochForWallClock(
            {
                day: date.getUTCDate(),
                hour: repeat.hour,
                minute: repeat.minute,
                month: date.getUTCMonth() + 1,
                year: date.getUTCFullYear(),
            },
            timezone
        );
        if (candidate > afterMs) {
            return candidate;
        }
    }
    throw new Error('A valid reminder cadence must have a future fire time.');
}

type CalendarRepeat = Exclude<ReminderRepeat, { kind: 'every' }>;

const weeklySlotLookbackMs = 8 * 86_400_000;

export function isReminderCadenceSlot(
    repeat: CalendarRepeat,
    fireAtMs: number,
    timezone: string
): boolean {
    return (
        Number.isFinite(fireAtMs) && nextReminderFireAt(repeat, fireAtMs - 1, timezone) === fireAtMs
    );
}

export function nextReminderFireAfterWake(
    repeat: ReminderRepeat,
    scheduledForMs: number,
    nowMs: number,
    timezone: string
): number {
    if (repeat.kind === 'every') {
        return nextReminderFireAt(repeat, nowMs, timezone);
    }
    let afterMs = nowMs;
    if (!isReminderCadenceSlot(repeat, scheduledForMs, timezone)) {
        afterMs = Math.max(afterMs, nearestReminderCadenceSlot(repeat, scheduledForMs, timezone));
    }
    return nextReminderFireAt(repeat, afterMs, timezone);
}

function nearestReminderCadenceSlot(
    repeat: CalendarRepeat,
    instantMs: number,
    timezone: string
): number {
    const after = nextReminderFireAt(repeat, instantMs, timezone);
    let previous = nextReminderFireAt(repeat, instantMs - weeklySlotLookbackMs, timezone);
    while (true) {
        const next = nextReminderFireAt(repeat, previous, timezone);
        if (next > instantMs) {
            return instantMs - previous <= after - instantMs ? previous : after;
        }
        previous = next;
    }
}

export function isValidReminderTimezone(timezone: string) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: timezone }).format();
        return true;
    } catch {
        return false;
    }
}

function parseTime(hourText: string, minuteText: string) {
    const hour = Number(hourText);
    const minute = Number(minuteText);
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? { hour, minute } : null;
}

function wallClockParts(date: Date, timezone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        day: '2-digit',
        hour: '2-digit',
        hour12: false,
        minute: '2-digit',
        month: '2-digit',
        timeZone: timezone,
        year: 'numeric',
    });
    const parts = new Map(formatter.formatToParts(date).map((part) => [part.type, part.value]));
    return {
        day: Number(parts.get('day')),
        hour: Number(parts.get('hour')),
        minute: Number(parts.get('minute')),
        month: Number(parts.get('month')),
        year: Number(parts.get('year')),
    };
}

function epochForWallClock(
    target: { day: number; hour: number; minute: number; month: number; year: number },
    timezone: string
) {
    const targetValue = wallClockValue(target);
    let guess = Date.UTC(target.year, target.month - 1, target.day, target.hour, target.minute);
    for (let pass = 0; pass < 2; pass++) {
        const seen = wallClockParts(new Date(guess), timezone);
        const difference = targetValue - wallClockValue(seen);
        if (difference === 0) {
            return guess;
        }
        guess += difference;
    }
    const seenValue = wallClockValue(wallClockParts(new Date(guess), timezone));
    return seenValue < targetValue ? guess + (targetValue - seenValue) : guess;
}

function wallClockValue(parts: {
    day: number;
    hour: number;
    minute: number;
    month: number;
    year: number;
}) {
    return Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute);
}
