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
 * `thoughtStillAfterMs`, and the freshest such line is held until then. In
 * memory only.
 */
export interface ThoughtCadence {
    offer(key: string, job: ThoughtJob): void;
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
                const line = await job.phrase();
                if (line) {
                    decide(entry, line, job);
                }
            } finally {
                entry.pending = false;
                const waiting = entry.waiting;
                entry.waiting = null;
                if (waiting) {
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
        entry.held = { announce: line.announce, run: job.run };
        entry.cancelHeld ??= schedule(
            () => {
                entry.cancelHeld = null;
                const held = entry.held;
                entry.held = null;
                // Phrased after the floor, so never more than a few seconds stale.
                if (held) {
                    held.run(async () => show(entry, held.announce));
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

    return {
        offer(key, job) {
            const at = now();
            for (const [entry, request] of requests) {
                if (isIdle(request) && at - request.lastAt >= thoughtCadenceTtlMs) {
                    requests.delete(entry);
                }
            }
            const entry = requests.get(key) ?? newRequest();
            requests.set(key, entry);
            offerTo(entry, job);
        },
    };
}

interface RequestCadence {
    cancelHeld: (() => void) | null;
    cancelWait: (() => void) | null;
    held: { announce: () => void; run: ThoughtJob['run'] } | null;
    /** When a frame last started phrasing; spaces frames before the first bubble. */
    lastAt: number;
    pending: boolean;
    shownAt: number | null;
    waiting: ThoughtJob | null;
}

function newRequest(): RequestCadence {
    return {
        cancelHeld: null,
        cancelWait: null,
        held: null,
        lastAt: Number.NEGATIVE_INFINITY,
        pending: false,
        shownAt: null,
        waiting: null,
    };
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
