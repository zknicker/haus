import { expect, test } from 'bun:test';
import type { UsageOverview } from '@haus/api';
import { buildRuntimeRow, type RuntimeUsageRow, staleUsageTimestamp } from './runtime-usage-row.ts';

const row: RuntimeUsageRow = {
    capturedAt: '2026-09-08T14:00:00.000Z',
    fiveHourWindow: null,
    id: 'claude-code',
    issue: null,
    stale: null,
    status: '',
    title: 'Claude Code',
    window: {
        id: 'current-week-all-models',
        label: 'Weekly Limit',
        resetsAt: '2026-09-10T14:00:00.000Z',
        usedPercent: 22,
    },
};

test('provider capture time determines freshness independently of newer Computer reports', () => {
    expect(staleUsageTimestamp(row, Date.parse('2026-09-08T14:29:00Z'))).toBeNull();
    expect(staleUsageTimestamp(row, Date.parse('2026-09-08T14:30:00Z'))).toBe(row.capturedAt);
});

test('an expired reset is historical even when its snapshot was just captured', () => {
    expect(
        staleUsageTimestamp(
            { ...row, capturedAt: '2026-09-10T14:00:00.000Z' },
            Date.parse('2026-09-10T14:01:00Z')
        )
    ).toBe('2026-09-10T14:00:00.000Z');
});

test('a Codex snapshot without a weekly window has no weekly allowance to show', () => {
    const built = buildRuntimeRow('codex', usageWithCodexWindows([codexSession(14_400)]), null);

    expect(built.window).toBeNull();
    expect(built.status).toBe('Plan limits unavailable');
    expect(built.fiveHourWindow).toMatchObject({ id: 'current-session', usedPercent: 17 });
});

test('a session window too long to be a 5-hour allowance leaves that column empty', () => {
    // An older Computer without duration-based Codex classification still
    // reports a weekly allowance as `current-session`; a weekly number must
    // never be labelled a rolling 5-hour limit.
    const built = buildRuntimeRow('codex', usageWithCodexWindows([codexSession(480_000)]), null);

    expect(built.fiveHourWindow).toBeNull();
    expect(built.status).toBe('Plan limits unavailable');
});

test('a session window with no duration hint stays in the 5-hour column', () => {
    const built = buildRuntimeRow('codex', usageWithCodexWindows([codexSession(null)]), null);

    expect(built.fiveHourWindow).toMatchObject({ id: 'current-session', usedPercent: 17 });
});

test('a Codex weekly window stays in the weekly column', () => {
    const built = buildRuntimeRow(
        'codex',
        usageWithCodexWindows([
            {
                id: 'current-week',
                label: 'Current week',
                remainingPercent: 87,
                resetAfterSeconds: 3600,
                resetsAt: '2026-08-14T16:00:00.000Z',
                usedPercent: 13,
            },
        ]),
        null
    );

    expect(built.window).toMatchObject({ id: 'current-week', label: 'Weekly Limit' });
    expect(built.fiveHourWindow).toBeNull();
});

test('usage authentication failures do not imply execution authentication failed', () => {
    const usage = usageWithCodexWindows([]);
    const signedOut = { ...usage, claude: providerError('claude', 'auth') };

    expect(buildRuntimeRow('claude-code', signedOut, null).issue).toBe('usage');
    expect(
        buildRuntimeRow('codex', { ...usage, codex: providerError('codex', 'auth') }, null).issue
    ).toBe('usage');
    expect(buildRuntimeRow('grok-build', usage, null).issue).toBe('usage');
});

test('an expired usage login keeps its retained meters and reports unavailable usage', () => {
    const usage = usageWithCodexWindows([]);
    const built = buildRuntimeRow(
        'claude-code',
        { ...usage, claude: retainedClaude({ at: '2026-08-14T15:15:00.000Z', code: 'auth' }) },
        null
    );

    expect(built.window).toMatchObject({ label: 'Weekly Limit', usedPercent: 28 });
    expect(built.stale).toEqual({ at: '2026-08-14T15:15:00.000Z', code: 'auth' });
    expect(built.issue).toBe('usage');
    // The stale stamp already names the failure, so the limit cell stays
    // generic rather than repeating it in the adjacent column.
    expect(built.status).toBe('Plan limits unavailable');
    // Retention is knowledge, not a freshness guess: the row says so at once.
    expect(staleUsageTimestamp(built, Date.parse('2026-08-14T15:16:00Z'))).toBe(
        '2026-08-14T15:00:00.000Z'
    );
});

test('a runtime retained past a request failure keeps the generic stale copy', () => {
    const usage = usageWithCodexWindows([]);
    const built = buildRuntimeRow(
        'claude-code',
        { ...usage, claude: retainedClaude({ at: '2026-08-14T15:15:00.000Z', code: 'request' }) },
        null
    );

    expect(built.status).toBe('Plan limits unavailable');
    expect(built.issue).toBe('usage');
});

test('a non-authentication failure keeps the generic unavailable copy', () => {
    const usage = usageWithCodexWindows([]);

    expect(buildRuntimeRow('claude-code', usage, null).status).toBe('Plan limits unavailable');
    expect(
        buildRuntimeRow('grok-build', { ...usage, grok: providerError('grok', 'request') }, null)
            .status
    ).toBe('Weekly limit unavailable');
});

function codexSession(resetAfterSeconds: number | null) {
    return {
        id: 'current-session' as const,
        label: 'Current session',
        remainingPercent: 83,
        resetAfterSeconds,
        resetsAt: '2026-08-20T03:31:27.000Z',
        usedPercent: 17,
    };
}

function retainedClaude(stale: { at: string; code: 'auth' | 'request' }) {
    return {
        provider: 'claude' as const,
        snapshot: {
            capturedAt: '2026-08-14T15:00:00.000Z',
            extraUsage: null,
            provider: 'claude' as const,
            source: 'anthropic-oauth-usage' as const,
            subscriptionType: 'max',
            windows: [
                {
                    id: 'current-week-all-models' as const,
                    label: 'Weekly Limit',
                    remainingPercent: 72,
                    resetsAt: '2026-08-21T15:00:00.000Z',
                    usedPercent: 28,
                },
            ],
        },
        stale,
        status: 'ok' as const,
    };
}

function providerError<T extends 'claude' | 'codex' | 'grok'>(
    provider: T,
    code: 'auth' | 'request'
) {
    return {
        error: { code, message: 'Unavailable.', name: 'UsageError' },
        provider,
        status: 'error',
    } as const;
}

function usageWithCodexWindows(
    windows: Extract<UsageOverview['codex'], { status: 'ok' }>['snapshot']['windows']
): UsageOverview {
    return {
        capturedAt: '2026-08-14T15:00:00.000Z',
        claude: providerError('claude', 'request'),
        codex: {
            provider: 'codex',
            snapshot: {
                capturedAt: '2026-08-14T15:00:00.000Z',
                creditsBalance: null,
                planType: 'pro',
                provider: 'codex',
                source: 'chatgpt-wham-usage',
                windows,
            },
            status: 'ok',
        },
        connectedProviders: ['openai-codex'],
        grok: providerError('grok', 'auth'),
        openRouter: {
            error: null,
            overview: {
                days: 30,
                keys: [],
                message: null,
                note: null,
                series: [],
                status: 'unconfigured',
                totalByokUsageUsd: 0,
                totalRequests: 0,
                totalUsageUsd: 0,
            },
            status: 'ok',
        },
        runtimeUsage: [],
    };
}
