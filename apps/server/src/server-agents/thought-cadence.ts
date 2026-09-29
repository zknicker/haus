import type { ThoughtStream } from './agent-thought-summarizer.ts';

/**
 * Until a request's first thought shows, frames closer than this wait, so a
 * skipped opening (claiming the task) never holds back the first bubble for long.
 */
export const thoughtFirstSpacingMs = 1000;
/**
 * After a bubble, the next frame waits at least this long, so a run that moves
 * through many small steps shows the major ones, one at a time.
 */
export const thoughtFloorMs = 15_000;
/** A finished action's result may state a finding sooner: news is worth a bubble. */
export const thoughtFindingFloorMs = 10_000;
/** The rank of a finished action with a result (`ThoughtJob.rank`). */
export const thoughtFindingRank = 2;
/**
 * A line that continues the work already shown ("Still digging through the
 * Bun changelog") shows only after this long without a bubble, so a long
 * stretch of one workstream never goes silent and a short one never repeats.
 */
export const thoughtStillAfterMs = 28_000;
/** A request quiet this long is forgotten; its turn has ended. */
const thoughtCadenceTtlMs = 10 * 60_000;

/** A phrased frame: its workstream judgment and how to announce it. */
export interface ThoughtLine {
    announce(): void;
    stream: ThoughtStream;
}

/** One frame's phrasing, offered to the cadence; it runs now, later, or never. */
export interface ThoughtJob {
    /**
     * Whether the frame's request is still the one its run is engaged on; false
     * once the turn settles, a `--done` reply answers it, or a newer message is
     * steered in. Checked before phrasing and again before announcing.
     */
    current(): Promise<boolean>;
    /** Phrases the frame against the lines shown so far; null when nothing should show. */
    phrase(): Promise<ThoughtLine | null>;
    /** A higher rank survives a lower one while both wait: a finding beats a title beats an action. */
    rank: number;
    /** Runs the phrasing as background work, so it never holds up the Computer's frames. */
    run(task: () => Promise<void>): void;
}

/**
 * How one request's thoughts pace themselves (ADR 0036): by workstream, not by
 * a clock. The first frame phrases at once; after a bubble, the next frame
 * waits out a short floor, one waiting at a time (the highest rank, then the
 * newest). A new workstream or finding shows as soon as it is phrased; a line
 * that continues the shown work shows only once the request has been quiet for
 * `thoughtStillAfterMs`, and the freshest such line is held until then.
 * Nothing outlives its request: a frame is phrased and announced only while
 * its request is current, a newer request on the run drops the older one's
 * held and waiting frames, and `endRun` drops the run's. In memory only.
 */
export interface ThoughtCadence {
    /** Drops every held and waiting frame of a run whose turn has settled. */
    endRun(run: string): void;
    offer(key: ThoughtCadenceKey, job: ThoughtJob): void;
}

/** One request of one run: the unit a cadence paces. */
export interface ThoughtCadenceKey {
    request: string;
    run: string;
}

export function createThoughtCadence(
    options: {
        now?: () => number;
        /** Runs `run` after `ms`; returns a cancel. Defaults to an unref'd `setTimeout`. */
        schedule?: (run: () => void, ms: number) => () => void;
    } = {}
): ThoughtCadence {
    const now = options.now ?? Date.now;
    const schedule = options.schedule ?? scheduleTimeout;
    const requests = new Map<string, RequestCadence>();

    const start = (entry: RequestCadence, job: ThoughtJob) => {
        entry.pending = true;
        entry.lastAt = now();
        job.run(async () => {
            try {
                // A request that has ended is never phrased: the summary is a paid call.
                if (!(await job.current())) {
                    return;
                }
                const line = await job.phrase();
                // The turn may have ended while the summary was in flight.
                if (line && !entry.ended && (await job.current())) {
                    decide(entry, line, job);
                }
            } finally {
                entry.pending = false;
                const waiting = entry.waiting;
                entry.waiting = null;
                if (waiting && !entry.ended) {
                    offerTo(entry, waiting);
                }
            }
        });
    };
    const decide = (entry: RequestCadence, line: ThoughtLine, job: ThoughtJob) => {
        const at = now();
        if (
            line.stream === 'new' ||
            entry.shownAt === null ||
            at - entry.shownAt >= thoughtStillAfterMs
        ) {
            show(entry, line.announce);
            return;
        }
        // Too soon for "still": hold the freshest one for when the quiet runs out.
        entry.held = { announce: line.announce, current: job.current, run: job.run };
        entry.cancelHeld ??= schedule(
            () => {
                entry.cancelHeld = null;
                const held = entry.held;
                entry.held = null;
                // Phrased after the floor, so never more than a few seconds stale.
                if (held) {
                    held.run(async () => {
                        if (!entry.ended && (await held.current())) {
                            show(entry, held.announce);
                        }
                    });
                }
            },
            entry.shownAt + thoughtStillAfterMs - at
        );
    };
    const show = (entry: RequestCadence, announce: () => void) => {
        announce();
        entry.shownAt = now();
        entry.held = null;
        entry.cancelHeld?.();
        entry.cancelHeld = null;
    };
    const offerTo = (entry: RequestCadence, job: ThoughtJob) => {
        if (entry.pending || entry.cancelWait) {
            entry.waiting = outranks(job, entry.waiting) ? job : entry.waiting;
            return;
        }
        const wait = readyAt(entry, job) - now();
        if (wait <= 0) {
            start(entry, job);
            return;
        }
        entry.waiting = job;
        entry.cancelWait = schedule(() => {
            entry.cancelWait = null;
            const waiting = entry.waiting;
            entry.waiting = null;
            if (waiting) {
                offerTo(entry, waiting);
            }
        }, wait);
    };

    const drop = (key: string, entry: RequestCadence) => {
        end(entry);
        requests.delete(key);
    };

    return {
        endRun(run) {
            for (const [key, entry] of requests) {
                if (entry.run === run) {
                    drop(key, entry);
                }
            }
        },
        offer({ request, run }, job) {
            const at = now();
            const key = `${run}\n${request}`;
            for (const [other, entry] of requests) {
                // A message steered into the run supersedes the request it was answering.
                const superseded = entry.run === run && other !== key;
                if (superseded || (isIdle(entry) && at - entry.lastAt >= thoughtCadenceTtlMs)) {
                    drop(other, entry);
                }
            }
            const entry = requests.get(key) ?? newRequest(run);
            requests.set(key, entry);
            offerTo(entry, job);
        },
    };
}

interface RequestCadence {
    cancelHeld: (() => void) | null;
    cancelWait: (() => void) | null;
    /** Set once the request is dropped; its in-flight phrasing announces nothing. */
    ended: boolean;
    held: { announce: () => void; current: ThoughtJob['current']; run: ThoughtJob['run'] } | null;
    /** When a frame last started phrasing; spaces frames before the first bubble. */
    lastAt: number;
    pending: boolean;
    run: string;
    shownAt: number | null;
    waiting: ThoughtJob | null;
}

function newRequest(run: string): RequestCadence {
    return {
        cancelHeld: null,
        cancelWait: null,
        ended: false,
        held: null,
        lastAt: Number.NEGATIVE_INFINITY,
        pending: false,
        run,
        shownAt: null,
        waiting: null,
    };
}

function end(entry: RequestCadence) {
    entry.ended = true;
    entry.cancelHeld?.();
    entry.cancelWait?.();
    entry.cancelHeld = null;
    entry.cancelWait = null;
    entry.held = null;
    entry.waiting = null;
}

/** Before a bubble, frames a second apart; after one, the floor (shorter for a finding). */
function readyAt(entry: RequestCadence, job: ThoughtJob): number {
    const floor = job.rank >= thoughtFindingRank ? thoughtFindingFloorMs : thoughtFloorMs;
    return entry.shownAt === null
        ? entry.lastAt + thoughtFirstSpacingMs
        : Math.max(entry.shownAt + floor, entry.lastAt + thoughtFirstSpacingMs);
}

function outranks(job: ThoughtJob, waiting: ThoughtJob | null): boolean {
    return waiting === null || job.rank >= waiting.rank;
}

function isIdle(entry: RequestCadence): boolean {
    return !(entry.pending || entry.cancelWait || entry.cancelHeld);
}

function scheduleTimeout(run: () => void, ms: number) {
    const timer = setTimeout(run, Math.max(ms, 0));
    timer.unref?.();
    return () => clearTimeout(timer);
}
