/**
 * A turn's ruler: its axis rounded up to a nice time, ticked at a step a
 * reader can count in (2s, 10s, 2m). Each turn keeps its own scale; the
 * rounding only gives the scale a readable end, so the longest step no longer
 * always touches the right edge.
 */
export interface TraceScale {
    /** The rounded axis every bar on this turn is placed against. */
    readonly scaleMs: number;
    /** Tick times from 0 to `scaleMs` inclusive: 3 to 5 of them. */
    readonly ticks: readonly number[];
}

/** At most this many intervals, so a ruler carries 3 to 5 ticks. */
const maxIntervals = 4;

const second = 1000;
const minute = 60 * second;
const hour = 60 * minute;

/**
 * Steps a clock reads in: 1/2/5 below a minute (plus 30s, since 50s reads
 * oddly beside 1m), then minute and hour steps that divide the next unit.
 */
const tickSteps: readonly number[] = [
    1,
    2,
    5,
    10,
    20,
    50,
    100,
    200,
    500,
    second,
    2 * second,
    5 * second,
    10 * second,
    20 * second,
    30 * second,
    minute,
    2 * minute,
    5 * minute,
    10 * minute,
    15 * minute,
    30 * minute,
    hour,
    2 * hour,
    6 * hour,
    12 * hour,
    24 * hour,
];

/**
 * The smallest clock step that covers `axisMs` in at most four intervals,
 * and the scale it rounds the axis up to. An empty axis has no scale.
 */
export function readTraceScale(axisMs: number): TraceScale | null {
    if (!(Number.isFinite(axisMs) && axisMs > 0)) {
        return null;
    }
    const step =
        tickSteps.find((candidate) => axisMs / candidate <= maxIntervals) ??
        Math.ceil(axisMs / maxIntervals / (24 * hour)) * 24 * hour;
    const intervals = Math.max(1, Math.ceil(axisMs / step - 1e-9));
    return {
        scaleMs: intervals * step,
        ticks: Array.from({ length: intervals + 1 }, (_, index) => index * step),
    };
}

/** A tick's label: `0`, `500ms`, `10s`, `1m 30s`, `2m`, `1h`. */
export function formatTraceTick(ms: number): string {
    if (ms === 0) {
        return '0';
    }
    if (ms < second) {
        return `${ms}ms`;
    }
    if (ms < minute) {
        return `${ms / second}s`;
    }
    if (ms < hour) {
        const minutes = Math.floor(ms / minute);
        const seconds = Math.round((ms % minute) / second);
        return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
    }
    const hours = Math.floor(ms / hour);
    const minutes = Math.round((ms % hour) / minute);
    return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

/**
 * A 1px line's `left` at `ms` on the scale, held inside the lane: the 0 line
 * sits on the lane's first pixel and the end line on its last.
 */
export function placeTick(ms: number, scaleMs: number): string {
    const percent = scaleMs > 0 ? Math.min(100, (ms / scaleMs) * 100) : 0;
    return `calc(${percent}% - ${percent / 100}px)`;
}
