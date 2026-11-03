/** Number, time and date wording for the innkeeper's lines. English, en-US digits. */

const monthNames = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
] as const;

export function count(value: number): string {
    return value.toLocaleString('en-US');
}

export function plural(value: number, one: string, many = `${one}s`): string {
    return value === 1 ? one : many;
}

/** `1.2 million`, `48.3 thousand`, or the plain count under a thousand. */
export function tokens(value: number): string {
    if (value >= 1_000_000_000) {
        return `${trimmed(value / 1_000_000_000)} billion`;
    }
    if (value >= 1_000_000) {
        return `${trimmed(value / 1_000_000)} million`;
    }
    if (value >= 10_000) {
        return `${trimmed(value / 1000)} thousand`;
    }
    return count(value);
}

/** `1.2B`, `48K`, for the recap's compact tiles. */
export function compactTokens(value: number): string {
    return new Intl.NumberFormat('en-US', {
        maximumFractionDigits: 1,
        notation: 'compact',
    }).format(value);
}

/** `midnight`, `9am`, `noon`, `4pm`. */
export function hour(value: number): string {
    if (value === 0) {
        return 'midnight';
    }
    if (value === 12) {
        return 'noon';
    }
    return value < 12 ? `${value}am` : `${value - 12}pm`;
}

/** Minutes after midnight as `7:05am`. */
export function clock(minuteOfDay: number): string {
    const hours = Math.floor(minuteOfDay / 60);
    const minutes = String(minuteOfDay % 60).padStart(2, '0');
    const suffix = hours < 12 ? 'am' : 'pm';
    const displayHour = hours % 12 === 0 ? 12 : hours % 12;
    return `${displayHour}:${minutes}${suffix}`;
}

/** `YYYY-MM-DD` as `March 14`. */
export function monthDay(date: string): string {
    const [, month, day] = date.split('-').map(Number);
    return `${monthName(month ?? 0)} ${day}`;
}

export function monthName(month: number): string {
    const name = monthNames[month - 1];
    if (!name) {
        throw new Error(`No month ${month}.`);
    }
    return name;
}

/** `4 seconds`, `2 minutes`, `3 hours`. */
export function duration(seconds: number): string {
    if (seconds < 60) {
        return `${seconds} ${plural(seconds, 'second')}`;
    }
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) {
        return `${minutes} ${plural(minutes, 'minute')}`;
    }
    const hours = Math.round(minutes / 60);
    return `${hours} ${plural(hours, 'hour')}`;
}

function trimmed(value: number): string {
    return value.toFixed(1).replace(/\.0$/, '');
}
