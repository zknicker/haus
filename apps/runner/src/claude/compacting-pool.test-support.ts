import { manualClock } from '../manual-clock.ts';
import { CompactingPool } from './compacting-pool.ts';
import type { IdleCompactionHooks } from './idle-compaction-scheduler.ts';
import {
    type IdleCompactable,
    type IdleCompactionResult,
    type IdleCompactionSkip,
    type IdleCompactionSnapshot,
    ONE_HOUR_CACHE_MS,
} from './idle-compaction.ts';

export const minute = 60_000;
export const dueMs = 54 * minute;
export const identity = { launchKey: 'launch-1', nativeSessionId: 'conversation-1' };
export const result: IdleCompactionResult = {
    costUsd: 0.42,
    endedAt: new Date(0),
    modelId: 'claude-haiku-5-5',
    startedAt: new Date(0),
    summary: 'summary',
    tokensAfter: 30_000,
    tokensBefore: 400_000,
    usage: null,
};

export class Session implements IdleCompactable {
    alive = true;
    compactions = 0;
    finish: ((value: IdleCompactionResult) => void) | null = null;
    fail: ((error: Error) => void) | null = null;
    holdsBackgroundWork = false;
    snapshot: IdleCompactionSnapshot | null;

    constructor(activityAt: number) {
        this.snapshot = {
            activityAt,
            cacheTtlMs: ONE_HOUR_CACHE_MS,
            contextTokens: 400_000,
            minTokens: 200_000,
            nearUsageLimit: false,
        };
    }

    compact() {
        this.compactions += 1;
        const done = Promise.withResolvers<IdleCompactionResult>();
        this.finish = done.resolve;
        this.fail = done.reject;
        return done.promise;
    }

    idleCompactionSnapshot() {
        return this.snapshot;
    }
}

export function setup(options: { busy?: boolean; idleMs?: number; maxWarm?: number } = {}) {
    const time = manualClock();
    const events: string[] = [];
    const reports: IdleCompactionResult[] = [];
    const skips: IdleCompactionSkip[] = [];
    const failures: unknown[] = [];
    const reported = { current: Promise.withResolvers<void>() };
    const receipts = { current: Promise.resolve() };
    let busy = options.busy ?? false;
    const hooks: IdleCompactionHooks<Session> = {
        busy: () => busy,
        compacted: () => receipts.current,
        failed: (_agentId, error) => failures.push(error),
        report: (_agentId, _process, compacted) => {
            reports.push(compacted);
            reported.current.resolve();
            return Promise.resolve();
        },
        skipped: (_agentId, reason) => skips.push(reason),
    };
    const pool = new CompactingPool<Session>({
        clock: time.clock,
        hooks,
        idleMs: options.idleMs ?? 60 * minute,
        maxWarm: options.maxWarm ?? 16,
        now: time.now,
    });
    return {
        events,
        failures,
        newSession: () => new Session(time.now()),
        pool,
        receipts,
        reported,
        reports,
        setBusy: (next: boolean) => {
            busy = next;
        },
        skips,
        time,
    };
}
