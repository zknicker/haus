import type { HeartbeatLane, HeartbeatMark } from '@haus/api';

/**
 * The Heartbeats view's pure model: where a mark sits on the day's track, the
 * night bands and hour ticks behind it, the words for each outcome, and a
 * lane per Agent.
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

export interface TrackTick {
    readonly at: number;
    /** Set on the ticks that carry a label (every sixth hour). */
    readonly label: string | null;
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

const tickLabels: Record<number, string> = { 0: '12a', 12: '12p', 18: '6p', 6: '6a' };

/** An hour tick across the day, the sixth hours labeled. */
export function readHourTicks(window: DayWindow): TrackTick[] {
    const start = new Date(window.startMs);
    return Array.from({ length: 24 }, (_, hour) => ({
        at: readTrackPosition(
            new Date(start.getFullYear(), start.getMonth(), start.getDate(), hour).getTime(),
            window
        ),
        label: tickLabels[hour] ?? null,
    }));
}

export function readMarkKey(agentId: string, mark: HeartbeatMark): string {
    return `${agentId}:${mark.kind}:${mark.at}`;
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

export interface LaneView {
    readonly agentId: string;
    readonly lane: HeartbeatLane;
}

/**
 * One lane per visible Agent, in the Agents' own order. An Agent with nothing
 * on the day still gets its (empty) lane, so an idle or paused Agent shows;
 * lanes of unknown Agents drop.
 */
export function readLanes(
    lanes: readonly HeartbeatLane[],
    agentOrder: readonly string[]
): LaneView[] {
    return agentOrder.map((agentId) => ({
        agentId,
        lane: lanes.find((candidate) => candidate.agentId === agentId) ?? {
            agentId,
            marks: [],
            tokens: 0,
        },
    }));
}
