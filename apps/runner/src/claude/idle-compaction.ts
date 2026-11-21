import type { RuntimeTokenUsage } from '../turn/turn-event.ts';

export const IDLE_COMPACTION_FRACTION = 0.9;
export const IDLE_COMPACTION_LATE_MS = 60_000;
export const ONE_HOUR_CACHE_MS = 60 * 60_000;
export const IDLE_COMPACTION_FLOOR_TOKENS = 100_000;
export const IDLE_COMPACTION_DEFAULT_MIN_TOKENS = 200_000;

export interface IdleCompactionSnapshot {
    readonly activityAt: number;
    readonly cacheTtlMs: number | null;
    readonly contextTokens: number;
    readonly minTokens: number;
    readonly nearUsageLimit: boolean;
}

export interface IdleCompactionResult {
    readonly costUsd: number | null;
    readonly endedAt: Date;
    readonly modelId: string;
    readonly startedAt: Date;
    readonly summary: string | null;
    readonly tokensAfter: number | null;
    readonly tokensBefore: number | null;
    readonly usage: RuntimeTokenUsage | null;
}

export interface IdleCompactable {
    readonly alive: boolean;
    readonly holdsBackgroundWork?: boolean;
    compact(): Promise<IdleCompactionResult>;
    idleCompactionSnapshot(): IdleCompactionSnapshot | null;
}

export interface IdleCompactionOwner {
    readonly agentDir: string;
    readonly agentId: string;
    readonly runtimeId: string;
}

export type IdleCompactionSkip =
    | 'busy'
    | 'late'
    | 'newer-activity'
    | 'small-context'
    | 'usage-limit';

export function idleCompactionMinTokens(env: Readonly<Record<string, string | undefined>>) {
    const raw = env.CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS;
    const configured = raw === undefined || raw.trim() === '' ? Number.NaN : Number(raw);
    const minTokens = Number.isFinite(configured) ? configured : IDLE_COMPACTION_DEFAULT_MIN_TOKENS;
    return Math.max(IDLE_COMPACTION_FLOOR_TOKENS, minTokens);
}

export function idleCompactionDueAt(snapshot: IdleCompactionSnapshot) {
    if (snapshot.cacheTtlMs !== ONE_HOUR_CACHE_MS) {
        return null;
    }
    return snapshot.activityAt + IDLE_COMPACTION_FRACTION * snapshot.cacheTtlMs;
}

export function idleCompactionVerdict(input: {
    armed: IdleCompactionSnapshot;
    busy: boolean;
    current: IdleCompactionSnapshot | null;
    dueAt: number;
    now: number;
}) {
    const { armed, current } = input;
    const verdict = (value: IdleCompactionSkip | 'compact') => value;
    if (input.now - input.dueAt > IDLE_COMPACTION_LATE_MS) {
        return verdict('late');
    }
    if (!current || current.activityAt !== armed.activityAt) {
        return verdict('newer-activity');
    }
    if (current.contextTokens < current.minTokens) {
        return verdict('small-context');
    }
    if (current.nearUsageLimit) {
        return verdict('usage-limit');
    }
    return verdict(input.busy ? 'busy' : 'compact');
}
