import { expect, test } from 'bun:test';
import {
    type IdleCompactionSnapshot,
    idleCompactionDueAt,
    idleCompactionMinTokens,
    idleCompactionVerdict,
    ONE_HOUR_CACHE_MS,
} from './idle-compaction.ts';

const snapshot: IdleCompactionSnapshot = {
    activityAt: 1_000_000,
    cacheTtlMs: ONE_HOUR_CACHE_MS,
    contextTokens: 400_000,
    minTokens: 200_000,
    nearUsageLimit: false,
};
const dueAt = snapshot.activityAt + 54 * 60_000;

test('the compaction comes due at 90% of the one-hour cache: 54 minutes after the last request', () => {
    expect(idleCompactionDueAt(snapshot)).toBe(dueAt);
});

test('a session whose last cache write was five minutes, or none, is never armed', () => {
    expect(idleCompactionDueAt({ ...snapshot, cacheTtlMs: 5 * 60_000 })).toBeNull();
    expect(idleCompactionDueAt({ ...snapshot, cacheTtlMs: null })).toBeNull();
});

test('the token threshold is Claude Code’s: max(100K, CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS ?? 200K)', () => {
    expect(idleCompactionMinTokens({})).toBe(200_000);
    expect(idleCompactionMinTokens({ CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS: '500000' })).toBe(
        500_000
    );
    expect(idleCompactionMinTokens({ CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS: '1' })).toBe(100_000);
    expect(idleCompactionMinTokens({ CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS: 'lots' })).toBe(200_000);
    expect(idleCompactionMinTokens({ CLAUDE_CODE_IDLE_COMPACT_MIN_TOKENS: '' })).toBe(200_000);
});

test('an armed compaction runs on time for an idle, large session', () => {
    expect(
        idleCompactionVerdict({
            armed: snapshot,
            busy: false,
            current: snapshot,
            dueAt,
            now: dueAt,
        })
    ).toBe('compact');
    // Up to a minute late still runs.
    expect(
        idleCompactionVerdict({
            armed: snapshot,
            busy: false,
            current: snapshot,
            dueAt,
            now: dueAt + 60_000,
        })
    ).toBe('compact');
});

test('every skip Claude Code makes, plus a busy session', () => {
    const verdict = (
        change: Partial<{ busy: boolean; current: IdleCompactionSnapshot | null; now: number }>
    ) =>
        idleCompactionVerdict({
            armed: snapshot,
            busy: false,
            current: snapshot,
            dueAt,
            now: dueAt,
            ...change,
        });
    // Fired more than a minute late: the machine slept through it.
    expect(verdict({ now: dueAt + 60_001 })).toBe('late');
    // A newer request moved the session's activity, or the process lost its history.
    expect(verdict({ current: { ...snapshot, activityAt: snapshot.activityAt + 1 } })).toBe(
        'newer-activity'
    );
    expect(verdict({ current: null })).toBe('newer-activity');
    expect(verdict({ current: { ...snapshot, contextTokens: 199_999 } })).toBe('small-context');
    expect(verdict({ current: { ...snapshot, nearUsageLimit: true } })).toBe('usage-limit');
    expect(verdict({ busy: true })).toBe('busy');
});
