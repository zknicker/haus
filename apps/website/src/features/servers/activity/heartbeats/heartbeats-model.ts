import type { HeartbeatLane } from '@haus/api';

/**
 * The Heartbeats feed's read model: local-day bounds, the multi-day windows the
 * feed pages backward through, merging those pages' lanes, and where a mark
 * sits on its day's track.
 */

/** Local days one `agent.heartbeats` read covers. */
export const pageDays = 3;

/** A hard stop on how far back the feed pages (about three months). */
export const maxPages = 30;

/** A local day's bounds as numbers. */
export interface DayBounds {
    readonly endMs: number;
    readonly startMs: number;
}

export function readDayBounds(atMs: number): DayBounds {
    const date = new Date(atMs);
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 1);
    return { endMs: end.getTime(), startMs: start.getTime() };
}

/**
 * Page `pageIndex`'s read window: the `pageDays` local days that end
 * `pageIndex * pageDays` days before the end of today; page 0 ends tonight.
 */
export function readPageWindow(pageIndex: number, nowMs: number): { from: string; to: string } {
    const today = new Date(nowMs);
    const shift = pageIndex * pageDays;
    const to = new Date(today.getFullYear(), today.getMonth(), today.getDate() - shift + 1);
    const from = new Date(
        today.getFullYear(),
        today.getMonth(),
        today.getDate() - shift - (pageDays - 1)
    );
    return { from: from.toISOString(), to: to.toISOString() };
}

/** Older days exist to read while the page just read held any mark. */
export function readNextPageIndex(
    pageIndex: number,
    lanes: readonly HeartbeatLane[]
): number | null {
    const hasMarks = lanes.some((lane) => lane.marks.length > 0);
    return hasMarks && pageIndex + 1 < maxPages ? pageIndex + 1 : null;
}

/** Lanes of every loaded page as one lane per Agent, marks oldest first, each once. */
export function mergeLanes(pages: readonly (readonly HeartbeatLane[])[]): HeartbeatLane[] {
    const byAgent = new Map<string, HeartbeatLane>();
    for (const lane of pages.flat()) {
        const known = byAgent.get(lane.agentId);
        const seen = new Set((known?.marks ?? []).map(markKey));
        const fresh = lane.marks.filter((mark) => !seen.has(markKey(mark)));
        byAgent.set(lane.agentId, {
            agentId: lane.agentId,
            marks: [...(known?.marks ?? []), ...fresh],
            tokens: (known?.tokens ?? 0) + lane.tokens,
        });
    }
    return [...byAgent.values()].map((lane) => ({
        ...lane,
        marks: [...lane.marks].sort((left, right) => left.at.localeCompare(right.at)),
    }));
}

/** A time's place on its day's track, in percent, held inside the track. */
export function readTrackPosition(atMs: number, day: DayBounds): number {
    const span = day.endMs - day.startMs;
    if (span <= 0) {
        return 0;
    }
    return Math.min(100, Math.max(0, ((atMs - day.startMs) / span) * 100));
}

function markKey(mark: HeartbeatLane['marks'][number]): string {
    return `${mark.at}:${mark.runId ?? mark.kind}`;
}
