/**
 * Waterfall geometry: every step's place on the turn's own time axis, and the
 * lanes overlapping siblings share, so five parallel sleeps read as parallel
 * rather than as a sequence.
 */

export interface TurnTraceTiming {
    /**
     * Wall time, elapsed-so-far while running. Null when start and end arrived
     * together (no real span was measured) or the end is unknown.
     */
    readonly durationMs: number | null;
    readonly isRunning: boolean;
    /** Milliseconds from the turn's start to the step's start. */
    readonly offsetMs: number;
}

/** One step's lane inside a set of overlapping siblings. */
export interface TurnTraceLane {
    /** Stable within one sibling list: steps sharing it ran at the same time. */
    readonly group: number;
    readonly lane: number;
    readonly lanes: number;
}

/** The turn's start and the caller's clock; `now` only moves running steps. */
export interface TraceClock {
    readonly now: number;
    readonly origin: number;
}

export function readTiming(
    startedAt: string,
    endedAt: string | undefined,
    isRunning: boolean,
    clock: TraceClock
): TurnTraceTiming {
    const start = parseTime(startedAt) ?? clock.origin;
    const end = isRunning ? clock.now : parseTime(endedAt);
    const duration = end === null ? null : Math.max(0, end - start);
    return {
        durationMs: duration === 0 && !isRunning ? null : duration,
        isRunning,
        offsetMs: Math.max(0, start - clock.origin),
    };
}

/** The envelope of several timings: a folded group's bar. */
export function spanTimings(timings: readonly TurnTraceTiming[]): TurnTraceTiming {
    const start = Math.min(...timings.map((timing) => timing.offsetMs));
    const end = Math.max(...timings.map(endOf));
    return {
        durationMs: end > start ? end - start : null,
        isRunning: timings.some((timing) => timing.isRunning),
        offsetMs: Number.isFinite(start) ? start : 0,
    };
}

/** Two timings overlap when each starts before the other ends; instants never do. */
export function overlaps(left: TurnTraceTiming, right: TurnTraceTiming): boolean {
    return left.offsetMs < endOf(right) && right.offsetMs < endOf(left);
}

/**
 * Lanes for siblings in start order: a run of steps that each start before the
 * run so far has ended is one parallel group, and each step takes the first
 * lane free at its start. A step that overlaps nothing gets null.
 */
export function assignLanes(
    timings: readonly (TurnTraceTiming | null)[]
): (TurnTraceLane | null)[] {
    const lanes: (TurnTraceLane | null)[] = timings.map(() => null);
    let group: number[] = [];
    let groupEnd = Number.NEGATIVE_INFINITY;
    let groupCount = 0;

    const close = () => {
        if (group.length > 1) {
            const laneEnds: number[] = [];
            const picked = group.map((index) => {
                const timing = timings[index] as TurnTraceTiming;
                const free = laneEnds.findIndex((laneEnd) => laneEnd <= timing.offsetMs);
                const lane = free === -1 ? laneEnds.length : free;
                laneEnds[lane] = endOf(timing);
                return lane;
            });
            for (const [position, index] of group.entries()) {
                lanes[index] = {
                    group: groupCount,
                    lane: picked[position] ?? 0,
                    lanes: laneEnds.length,
                };
            }
            groupCount += 1;
        }
        group = [];
        groupEnd = Number.NEGATIVE_INFINITY;
    };

    for (const [index, timing] of timings.entries()) {
        // An instant spans nothing, so it neither joins nor breaks a group.
        if (!timing || endOf(timing) <= timing.offsetMs) {
            continue;
        }
        if (group.length > 0 && timing.offsetMs >= groupEnd) {
            close();
        }
        group.push(index);
        groupEnd = Math.max(groupEnd, endOf(timing));
    }
    close();
    return lanes;
}

function endOf(timing: TurnTraceTiming): number {
    return timing.offsetMs + (timing.durationMs ?? 0);
}

function parseTime(value: string | undefined): number | null {
    if (!value) {
        return null;
    }
    const time = Date.parse(value);
    return Number.isNaN(time) ? null : time;
}
