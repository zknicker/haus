import type { HeartbeatMark } from '@haus/api';

/**
 * The Heartbeats view's pure model: the local day, where a mark sits on the
 * day's timeline, the night bands behind it, and the words for each outcome.
 */
export type HeartbeatOutcome = HeartbeatMark['outcome'];

/** The viewer's local day: its bounds as the Server read wants them, and as numbers. */
export interface DayWindow {
    readonly endMs: number;
    readonly from: string;
    readonly startMs: number;
    readonly to: string;
}

export interface TrackBand {
    readonly left: number;
    readonly width: number;
}

/** The local day `offsetDays` before today's; 0 is today. */
export function readDayWindow(offsetDays: number, now: number): DayWindow {
    const today = new Date(now);
    const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - offsetDays);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return {
        endMs: end.getTime(),
        from: start.toISOString(),
        startMs: start.getTime(),
        to: end.toISOString(),
    };
}

/** A time's place on the day's track, in percent, held inside the track. */
export function readTrackPosition(atMs: number, window: DayWindow): number {
    const span = window.endMs - window.startMs;
    if (span <= 0) {
        return 0;
    }
    return Math.min(100, Math.max(0, ((atMs - window.startMs) / span) * 100));
}

/** Night is 22:00 to 08:00 on the viewer's clock: a band at each end of the track. */
export function readNightBands(window: DayWindow): TrackBand[] {
    const start = new Date(window.startMs);
    const at = (hour: number) =>
        readTrackPosition(
            new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour).getTime(),
            window
        );
    const morning = at(8);
    const evening = at(22);
    return [
        { left: 0, width: morning },
        { left: evening, width: 100 - evening },
    ];
}

export const outcomeLabels: Record<HeartbeatOutcome, string> = {
    failed: 'Failed',
    paused: 'Paused',
    quiet: 'Quiet',
    reported: 'Reported',
    running: 'Running',
    skipped: 'Skipped',
    yielded: 'Yielded',
};

export function formatTokens(tokens: number | null): string | null {
    if (tokens === null) {
        return null;
    }
    if (tokens < 1000) {
        return String(tokens);
    }
    if (tokens < 1_000_000) {
        const thousands = tokens / 1000;
        return `${thousands < 100 ? thousands.toFixed(1) : Math.round(thousands)}k`;
    }
    return `${(tokens / 1_000_000).toFixed(1)}M`;
}
