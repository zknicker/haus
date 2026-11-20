import type { RuntimeTokenUsage } from './turn-event.ts';

/**
 * Idle compaction, mirroring Claude Code's own (2.1.299+), which it does not arm for a headless
 * SDK session (specs/runtime-drivers.md "Idle compaction"). After a turn whose last main request
 * wrote the one-hour prompt cache, a parked session compacts at 90% of the way to the cache's
 * expiry (~54 minutes), so the next turn resumes a summary instead of re-writing a cold
 * 200K-950K-token prefix. The math and skip rules are Claude Code's; Haus adds its own busy
 * checks and the Server setting.
 */

/** Claude Code fires at this fraction of the way from the last request to cache expiry. */
export const IDLE_COMPACTION_FRACTION = 0.9;

/** A timer that fires later than this past its due time (a sleeping machine) is skipped. */
export const IDLE_COMPACTION_LATE_MS = 60_000;

/** The one-hour prompt cache TTL; Claude Code arms idle compaction only for it. */
export const ONE_HOUR_CACHE_MS = 60 * 60_000;

/** Claude Code's floor and default for `CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS`. */
export const IDLE_COMPACTION_FLOOR_TOKENS = 100_000;
export const IDLE_COMPACTION_DEFAULT_MIN_TOKENS = 200_000;

/** What a parked session knows about its last main-conversation model request. */
export interface IdleCompactionSnapshot {
    /** When that request answered (epoch ms): Claude Code's `lastActivityAt`. */
    readonly activityAt: number;
    /** The prompt-cache lifetime that request wrote; null when it wrote no cache yet. */
    readonly cacheTtlMs: number | null;
    /** The request's whole prompt: fresh, cache-read, and cache-written input tokens. */
    readonly contextTokens: number;
    /** The smallest context worth compacting (`idleCompactionMinTokens`). */
    readonly minTokens: number;
    /** The runtime reported its usage limit as anything but plainly allowed. */
    readonly nearUsageLimit: boolean;
}

/** One finished idle compaction, as the Computer records it. */
export interface IdleCompactionResult {
    /** The CLI's API-equivalent cost of the compaction (its cumulative cost's difference). */
    readonly costUsd: number | null;
    readonly endedAt: Date;
    /** The model the session runs, which the compaction summarized with. */
    readonly modelId: string;
    readonly startedAt: Date;
    /** The summary the session continues from; null when the runtime printed none. */
    readonly summary: string | null;
    readonly tokensAfter: number | null;
    readonly tokensBefore: number | null;
    /** Every request the compaction made (its cumulative usage's difference). */
    readonly usage: RuntimeTokenUsage | null;
}

/** A parked process that can compact its own conversation while idle. */
export interface IdleCompactable {
    /** Runs the runtime's own compaction (`/compact`) on the parked process. */
    compact(): Promise<IdleCompactionResult>;
    /** The last main request, or null when this process has made none. */
    idleCompactionSnapshot(): IdleCompactionSnapshot | null;
}

export type IdleCompactionSkip =
    | 'busy'
    | 'late'
    | 'newer-activity'
    | 'small-context'
    | 'usage-limit';

/** Claude Code's threshold: `max(100000, CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS ?? 200000)`. */
export function idleCompactionMinTokens(env: Readonly<Record<string, string | undefined>>): number {
    const raw = env.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS;
    const configured = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw);
    const minTokens = Number.isFinite(configured) ? configured : IDLE_COMPACTION_DEFAULT_MIN_TOKENS;
    return Math.max(IDLE_COMPACTION_FLOOR_TOKENS, minTokens);
}

/**
 * When the compaction fires: `lastActivityAt + 0.9 × (cacheExpiresAt − lastActivityAt)`. Null
 * when the last request did not write the one-hour cache, which Claude Code never arms for.
 */
export function idleCompactionDueAt(snapshot: IdleCompactionSnapshot): number | null {
    if (snapshot.cacheTtlMs !== ONE_HOUR_CACHE_MS) {
        return null;
    }
    return snapshot.activityAt + IDLE_COMPACTION_FRACTION * snapshot.cacheTtlMs;
}

/**
 * Decides at fire time whether the armed compaction still runs. `armed` is the snapshot the timer
 * was set from; `current` is the process's now. Every skip is Claude Code's except `busy`, which
 * also covers Haus's own work: a run waiting for the Agent, or background work still running.
 */
export function idleCompactionVerdict(input: {
    armed: IdleCompactionSnapshot;
    busy: boolean;
    current: IdleCompactionSnapshot | null;
    dueAt: number;
    now: number;
}): IdleCompactionSkip | 'compact' {
    const { armed, current } = input;
    if (input.now - input.dueAt > IDLE_COMPACTION_LATE_MS) {
        return 'late';
    }
    if (!current || current.activityAt !== armed.activityAt) {
        return 'newer-activity';
    }
    if (current.contextTokens < current.minTokens) {
        return 'small-context';
    }
    if (current.nearUsageLimit) {
        return 'usage-limit';
    }
    return input.busy ? 'busy' : 'compact';
}
