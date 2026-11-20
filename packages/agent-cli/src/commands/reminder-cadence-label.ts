import { AgentCliError } from '../agent-error.ts';

const dayNames: Record<string, string> = {
    fri: 'Friday',
    mon: 'Monday',
    sat: 'Saturday',
    sun: 'Sunday',
    thu: 'Thursday',
    tue: 'Tuesday',
    wed: 'Wednesday',
};
const unitNames: Record<string, string> = { d: 'day', h: 'hour', m: 'minute' };

/** Whether a repeat is a wall-clock agreement that needs a named zone. */
export function isCalendarRepeat(repeat: string | null | undefined): boolean {
    return /^(daily@|weekly:)/u.test(repeat ?? '');
}

/**
 * A cadence as the Agent restates it to a human, with the zone it recurs in:
 * "Every Monday at 15:57 America/New_York". Unknown grammar prints verbatim.
 */
export function describeCadence(repeat: string, timezone: string | undefined): string {
    const zone = timezone ? ` ${timezone}` : '';
    const daily = /^daily@(\d{2}:\d{2})$/u.exec(repeat);
    if (daily) {
        return `Every day at ${daily[1]}${zone}`;
    }
    const weekly = /^weekly:([a-z,]+)@(\d{2}:\d{2})$/u.exec(repeat);
    if (weekly?.[1]) {
        const days = weekly[1].split(',').map((day) => dayNames[day] ?? day);
        return `Every ${joinDays(days)} at ${weekly[2]}${zone}`;
    }
    const every = /^every:(\d+)([mhd])$/u.exec(repeat);
    if (every?.[1] && every[2]) {
        const unit = unitNames[every[2]];
        return every[1] === '1' ? `Every ${unit}` : `Every ${every[1]} ${unit}s`;
    }
    return `Repeats ${repeat}`;
}

/** An instant as wall clock in a zone, with the UTC instant for exactness. */
export function formatZonedFire(timestamp: string, timezone: string): string {
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) {
        throw new AgentCliError('INVALID_JSON_RESPONSE', `Invalid reminder time: ${timestamp}`);
    }
    const parts = new Map(
        new Intl.DateTimeFormat('en-US', {
            day: '2-digit',
            hour: '2-digit',
            hourCycle: 'h23',
            minute: '2-digit',
            month: '2-digit',
            timeZone: timezone,
            timeZoneName: 'short',
            weekday: 'short',
            year: 'numeric',
        })
            .formatToParts(date)
            .map((part) => [part.type, part.value])
    );
    const wallClock = `${parts.get('year')}-${parts.get('month')}-${parts.get('day')} ${parts.get('hour')}:${parts.get('minute')}`;
    return `${parts.get('weekday')} ${wallClock} ${parts.get('timeZoneName')} (${date.toISOString()})`;
}

function joinDays(days: string[]): string {
    if (days.length <= 2) {
        return days.join(' and ');
    }
    return `${days.slice(0, -1).join(', ')}, and ${days.at(-1)}`;
}
