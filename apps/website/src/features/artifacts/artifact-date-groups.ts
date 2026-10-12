import type { ArtifactMetadata } from '@haus/api';

export interface ArtifactDateGroup {
    artifacts: ArtifactMetadata[];
    key: string;
    label: string;
}

/**
 * Buckets a newest-first list by when each file last changed, in the viewer's
 * zone: Today, Yesterday, the weekday through the past week, then the day
 * ("Oct 3") for the rest of this month, the month ("September") for the rest
 * of this year, and the year before that. Order follows the input.
 */
export function groupArtifactsByDate(
    artifacts: readonly ArtifactMetadata[],
    now: number,
    timeZone: string
): ArtifactDateGroup[] {
    const today = zonedDay(new Date(now), timeZone);
    const groups = new Map<string, ArtifactDateGroup>();
    for (const artifact of artifacts) {
        const { key, label } = bucketFor(new Date(artifact.updated_at), today, timeZone);
        const group = groups.get(key);
        if (group) {
            group.artifacts.push(artifact);
        } else {
            groups.set(key, { artifacts: [artifact], key, label });
        }
    }
    return [...groups.values()];
}

interface ZonedDay {
    day: number;
    month: number;
    /** Days since the epoch for this calendar date, for whole-day differences. */
    ordinal: number;
    year: number;
}

function bucketFor(date: Date, today: ZonedDay, timeZone: string) {
    const day = zonedDay(date, timeZone);
    const age = today.ordinal - day.ordinal;
    const dayKey = `day:${day.year}-${day.month}-${day.day}`;
    if (age <= 0) {
        return { key: 'today', label: 'Today' };
    }
    if (age === 1) {
        return { key: 'yesterday', label: 'Yesterday' };
    }
    if (age < 7) {
        return { key: dayKey, label: format(date, timeZone, { weekday: 'long' }) };
    }
    if (day.year === today.year && day.month === today.month) {
        return { key: dayKey, label: format(date, timeZone, { day: 'numeric', month: 'short' }) };
    }
    if (day.year === today.year) {
        return {
            key: `month:${day.year}-${day.month}`,
            label: format(date, timeZone, { month: 'long' }),
        };
    }
    return { key: `year:${day.year}`, label: String(day.year) };
}

function zonedDay(date: Date, timeZone: string): ZonedDay {
    const parts = new Intl.DateTimeFormat('en-US', {
        day: 'numeric',
        month: 'numeric',
        timeZone,
        year: 'numeric',
    }).formatToParts(date);
    const part = (type: Intl.DateTimeFormatPartTypes) =>
        Number(parts.find((entry) => entry.type === type)?.value);
    const year = part('year');
    const month = part('month');
    const day = part('day');
    return { day, month, ordinal: Date.UTC(year, month - 1, day) / 86_400_000, year };
}

function format(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) {
    return new Intl.DateTimeFormat('en-US', { ...options, timeZone }).format(date);
}
