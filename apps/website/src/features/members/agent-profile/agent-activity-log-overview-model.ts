/**
 * One day of work on a single time axis. Busy
 * stretches keep real time; idle longer than `breakMs` folds to a fixed-width
 * break, so a quiet afternoon never pushes the work into slivers. Every turn
 * keeps a minimum width so it stays a visible, pointable block, and a turn
 * that would overlap its neighbour slides just past it. Today's axis ends at
 * now.
 */
export type TimelineStatus = 'completed' | 'failed' | 'interrupted' | 'working';

export interface TimelineTurnInput {
    readonly endMs: number;
    readonly runId: string;
    readonly startMs: number;
    readonly status: TimelineStatus;
}

export interface TimelineBlock {
    readonly left: number;
    readonly runId: string;
    readonly status: TimelineStatus;
    readonly width: number;
}

export interface TimelineBreak {
    /** Where the break's glyph sits on the axis. */
    readonly at: number;
    readonly label: string;
}

export interface TimelineTick {
    readonly at: number;
    /**
     * `start` ticks name a busy stretch's first turn and anchor their label at
     * that block's left edge; `minor` ticks are round times inside a stretch,
     * centered; `now` closes today's axis.
     */
    readonly rank: 'minor' | 'now' | 'start';
    readonly time: number;
}

export interface TimelineSpan {
    readonly left: number;
    readonly width: number;
}

export interface DayTimeline {
    readonly blocks: readonly TimelineBlock[];
    readonly breaks: readonly TimelineBreak[];
    readonly isToday: boolean;
    readonly spans: readonly TimelineSpan[];
    readonly ticks: readonly TimelineTick[];
}

/** The strip's measures in percent of its width, derived from pixels by the caller. */
export interface TimelineMeasure {
    /** Clear space between neighbouring blocks. */
    readonly blockGap: number;
    /** Room one clock label needs. */
    readonly labelGap: number;
    /** The least width a turn's block keeps. */
    readonly minBlock: number;
}

/** Idle longer than this folds into a break. */
const breakMs = 12 * 60_000;
/** Shares of the axis: a break's width, and the least a busy stretch keeps. */
const breakShare = 0.04;
const minWindowShare = 0.06;
const tickSteps = [1, 2, 5, 10, 15, 30, 60, 120].map((minutes) => minutes * 60_000);

interface Window {
    end: number;
    first: number;
    /** When the stretch's last turn ended: round ticks stop here. */
    last: number;
    start: number;
    turns: number;
}

type Placed = Window & TimelineSpan;

/**
 * A stretch's width splits evenly between the time it spans and the turns in
 * it, so five quick turns are never a sliver beside one long one.
 */
export function buildDayTimeline(
    turns: readonly TimelineTurnInput[],
    now: number,
    isToday: boolean,
    measure: TimelineMeasure
): DayTimeline {
    const ordered = [...turns].sort((left, right) => left.startMs - right.startMs);
    if (ordered.length === 0) {
        return { blocks: [], breaks: [], isToday, spans: [], ticks: [] };
    }
    const windows = readWindows(ordered, isToday ? now : null);
    const busy = windows.reduce((sum, window) => sum + (window.end - window.start), 0) || 1;
    const weights = windows.map((window) =>
        window.turns === 0
            ? 0
            : Math.max(
                  minWindowShare,
                  0.5 * ((window.end - window.start) / busy) + 0.5 * (window.turns / ordered.length)
              )
    );
    const total =
        weights.reduce((sum, weight) => sum + weight, 0) + breakShare * (windows.length - 1);

    let cursor = 0;
    const placed: Placed[] = windows.map((window, index) => {
        const width = ((weights[index] ?? 0) / total) * 100;
        const entry = { ...window, left: cursor, width };
        cursor += width + (breakShare / total) * 100;
        return entry;
    });
    const at = (time: number) => {
        const window = placed.find((entry) => time <= entry.end) ?? (placed.at(-1) as Placed);
        const span = window.end - window.start || 1;
        const fraction = Math.min(1, Math.max(0, (time - window.start) / span));
        return window.left + fraction * window.width;
    };

    const breaks = placed.slice(1).map((entry, index) => {
        const previous = placed[index] as Placed;
        const left = previous.left + previous.width;
        return { at: (left + entry.left) / 2, label: formatIdle(entry.start - previous.end) };
    });

    return {
        blocks: placeBlocks(ordered, at, measure),
        breaks,
        isToday,
        spans: placed
            .filter((entry) => entry.width > 0)
            .map(({ left, width }) => ({ left, width })),
        ticks: readTicks(placed, at, isToday ? now : null, measure.labelGap),
    };
}

/** Real positions, then a floor width and a slide past any neighbour they would cover. */
function placeBlocks(
    turns: readonly TimelineTurnInput[],
    at: (time: number) => number,
    { blockGap, minBlock }: TimelineMeasure
): TimelineBlock[] {
    let edge = Number.NEGATIVE_INFINITY;
    return turns.map((turn) => {
        const start = at(turn.startMs);
        const width = Math.max(minBlock, at(turn.endMs) - start);
        const left = Math.min(Math.max(start, edge + blockGap), 100 - width);
        edge = left + width;
        return { left, runId: turn.runId, status: turn.status, width };
    });
}

/** Busy stretches: turns closer than `breakMs` share one, padded so edges breathe. */
function readWindows(turns: readonly TimelineTurnInput[], now: number | null): Window[] {
    const windows: Window[] = [];
    for (const turn of turns) {
        const last = windows.at(-1);
        if (last && turn.startMs - last.end <= breakMs) {
            last.end = Math.max(last.end, turn.endMs);
            last.last = last.end;
            last.turns += 1;
        } else {
            windows.push({
                end: turn.endMs,
                first: turn.startMs,
                last: turn.endMs,
                start: turn.startMs,
                turns: 1,
            });
        }
    }
    const lastEnd = (windows.at(-1) as Window).end;
    for (const window of windows) {
        const pad = Math.min(3 * 60_000, Math.max(20_000, (window.end - window.start) * 0.06));
        window.start -= pad;
        window.end += pad;
    }
    const last = windows.at(-1) as Window;
    if (now !== null) {
        // Today's axis ends exactly at now: close enough joins the last
        // stretch, further off becomes one more break and a zero-width
        // stretch at now.
        if (now - lastEnd <= breakMs) {
            last.end = now;
        } else {
            windows.push({ end: now, first: now, last: now, start: now, turns: 0 });
        }
    }
    return windows;
}

/**
 * Each stretch's first turn is named under its block; round times fill in
 * where they fit. Labels never overlap: each claims its own extent (a start
 * label reads rightward from its tick, a minor one is centered, Now ends at
 * the edge) and lower ranks give way.
 */
function readTicks(
    windows: readonly Placed[],
    at: (time: number) => number,
    now: number | null,
    labelGap: number
): TimelineTick[] {
    const candidates: TimelineTick[] = [];
    if (now !== null) {
        candidates.push({ at: 100, rank: 'now', time: now });
    }
    for (const window of windows) {
        if (window.turns === 0) {
            continue;
        }
        candidates.push({ at: at(window.first), rank: 'start', time: window.first });
        const wanted = Math.max(1, window.width / (labelGap * 1.4));
        const step =
            tickSteps.find((candidate) => (window.end - window.start) / candidate <= wanted) ??
            (tickSteps.at(-1) as number);
        for (let time = Math.ceil(window.first / step) * step; time <= window.last; time += step) {
            candidates.push({ at: at(time), rank: 'minor', time });
        }
    }
    const order = { minor: 2, now: 0, start: 1 } as const;
    const kept: TimelineTick[] = [];
    const extent = (tick: TimelineTick): [number, number] =>
        tick.rank === 'start'
            ? [tick.at, tick.at + labelGap]
            : tick.rank === 'now'
              ? [tick.at - labelGap * 0.6, tick.at]
              : [tick.at - labelGap / 2, tick.at + labelGap / 2];
    for (const tick of [...candidates].sort((a, b) => order[a.rank] - order[b.rank])) {
        const [from, to] = extent(tick);
        const clear = kept.every((other) => {
            const [otherFrom, otherTo] = extent(other);
            return to + labelGap * 0.15 <= otherFrom || from >= otherTo + labelGap * 0.15;
        });
        if (clear && to <= 100.5) {
            kept.push(tick);
        }
    }
    return kept.sort((a, b) => a.at - b.at);
}

/** One unit, rounded: `14m`, `2h`, `3d`. */
function formatIdle(ms: number): string {
    const minutes = Math.round(ms / 60_000);
    if (minutes < 60) {
        return `${minutes}m`;
    }
    const hours = Math.round(minutes / 60);
    return hours < 24 ? `${hours}h` : `${Math.round(hours / 24)}d`;
}
