import { describe, expect, test } from 'bun:test';
import { formatMemoryIndex, memoryHead } from './memory-index.ts';
import type { AgentSessionState } from './session-store.ts';
import { acpUsageUpdateContextTokens } from './token-usage.ts';
import {
    coldSessionId,
    decideWakeRecycle,
    readWakeRecycleConfig,
    recycledSession,
    type WakeRecycleConfig,
} from './wake-recycle.ts';

const now = Date.parse('2026-10-06T12:00:00.000Z');
const config: WakeRecycleConfig = {
    enabled: true,
    minContextTokens: 128_000,
    minIdleMs: 3_600_000,
};
const live: Facts = {
    lastContextTokens: 150_000,
    lastTurnEndedAt: new Date(now - 3_600_001).toISOString(),
    resumeState: { type: 'resume-session' },
};

type Facts = Pick<AgentSessionState, 'lastContextTokens' | 'lastTurnEndedAt' | 'resumeState'>;

function decide(
    session: Facts,
    overrides: { config?: Partial<WakeRecycleConfig>; optedOut?: boolean } = {}
) {
    return decideWakeRecycle({
        config: { ...config, ...overrides.config },
        now,
        optedOut: overrides.optedOut ?? false,
        session,
    });
}

describe('decideWakeRecycle', () => {
    test('recycles a cold, large session', () => {
        expect(decide(live)).toEqual({
            idleMs: 3_600_001,
            priorContextTokens: 150_000,
            reason: 'cold_gap_large_context',
            recycle: true,
        });
    });

    test('resumes at the exact thresholds, which are strict', () => {
        expect(
            decide({ ...live, lastTurnEndedAt: new Date(now - 3_600_000).toISOString() }).reason
        ).toBe('cache_possibly_warm');
        expect(decide({ ...live, lastContextTokens: 128_000 }).reason).toBe(
            'context_below_threshold'
        );
    });

    test('gates in order: switch, opt-out, prior session, facts', () => {
        expect(decide(live, { config: { enabled: false } }).reason).toBe('disabled');
        expect(decide(live, { optedOut: true }).reason).toBe('agent_opted_out');
        expect(decide({ ...live, resumeState: null }).reason).toBe('no_prior_session');
        expect(decide({ ...live, lastTurnEndedAt: null }).reason).toBe('turn_facts_unavailable');
        expect(decide({ ...live, lastContextTokens: null }).reason).toBe('turn_facts_unavailable');
    });
});

describe('wake recycle session identity', () => {
    const session = {
        generation: 3,
        resumeState: { type: 'resume-session' },
        runtimeSessionId: 'agt_a-3',
        wakeRecycleCount: 0,
    } as unknown as AgentSessionState;

    test('a recycle drops resume coordinates and moves to a never-used id', () => {
        const first = recycledSession(session);
        expect(first.resumeState).toBeNull();
        expect(first.runtimeSessionId).toBeNull();
        expect(coldSessionId('agt_a', session)).toBe('agt_a-3');
        expect(coldSessionId('agt_a', first)).toBe('agt_a-3-w1');
        expect(coldSessionId('agt_a', recycledSession(first))).toBe('agt_a-3-w2');
    });

    test('config defaults off with Raft thresholds and ignores junk numbers', () => {
        expect(readWakeRecycleConfig({})).toEqual({
            enabled: false,
            minContextTokens: 128_000,
            minIdleMs: 3_600_000,
        });
        expect(
            readWakeRecycleConfig({
                HAUS_WAKE_RECYCLE: '1',
                HAUS_WAKE_RECYCLE_MIN_CONTEXT_TOKENS: 'lots',
                HAUS_WAKE_RECYCLE_MIN_IDLE_MS: '60000',
            })
        ).toEqual({ enabled: true, minContextTokens: 128_000, minIdleMs: 60_000 });
    });
});

describe('memory index', () => {
    test('a small MEMORY.md is shown complete', () => {
        const block = formatMemoryIndex('# Memory\n- fact\n');
        expect(block).toContain('complete="true"');
        expect(block).toContain('- fact');
    });

    test('truncation backs up to a newline in the last 20%', () => {
        const content = `${'a'.repeat(90)}\n${'b'.repeat(30)}\n`;
        expect(memoryHead(content, 100)).toEqual({ complete: false, head: `${'a'.repeat(90)}\n` });
    });

    test('truncation never splits a code point and keeps mid-line cuts far from a newline', () => {
        const content = `x\n${'é'.repeat(100)}`;
        const { complete, head } = memoryHead(content, 51);
        expect(complete).toBe(false);
        expect(head).toBe(`x\n${'é'.repeat(24)}`);
        expect(formatMemoryIndex(content, 51)).toContain('shown="first');
    });
});

describe('ACP context tokens', () => {
    test('a usage_update carries the context fill; anything else keeps the current value', () => {
        expect(
            acpUsageUpdateContextTokens({ sessionUpdate: 'usage_update', size: 1, used: 9 }, 3)
        ).toBe(9);
        expect(acpUsageUpdateContextTokens({ sessionUpdate: 'agent_message_chunk' }, 3)).toBe(3);
        expect(acpUsageUpdateContextTokens(null, null)).toBeNull();
    });
});
