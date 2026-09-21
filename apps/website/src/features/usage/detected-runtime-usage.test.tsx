import { expect, test } from 'bun:test';
import type { UsageOverview } from '@haus/api';
import { renderToStaticMarkup } from 'react-dom/server';
import { DetectedRuntimeUsage } from './detected-runtime-usage.tsx';
import { usageFixture } from './usage-fixtures.ts';

test('keeps a sole Codex session window in the 5-hour column', () => {
    const markup = renderCodexWindows([
        {
            id: 'current-session',
            label: 'Current session',
            remainingPercent: 83,
            resetAfterSeconds: 14_400,
            resetsAt: '2026-08-20T03:31:27.000Z',
            usedPercent: 17,
        },
    ]);

    // A 5-hour session allowance is not a weekly one: the weekly column says so
    // rather than relabelling the burst window.
    expect(markup).toContain('Plan limits unavailable');
    expect(markup).toContain('5-hour limit, 17% used.');
    expect(markup).not.toContain('Codex Weekly Limit');
});

test('refuses a session window too long to be a 5-hour allowance', () => {
    // An older Computer without duration-based Codex classification reports a
    // weekly allowance as `current-session`. Labelling that "Rolling 5-hour
    // limit" would misreport the number, so the column stays empty.
    const markup = renderCodexWindows([
        {
            id: 'current-session',
            label: 'Current session',
            remainingPercent: 83,
            resetAfterSeconds: 480_000,
            resetsAt: '2026-08-20T03:31:27.000Z',
            usedPercent: 17,
        },
    ]);

    expect(markup).toContain('Plan limits unavailable');
    expect(markup).toContain('No 5-hour limit');
    expect(markup).not.toContain('5-hour limit, 17% used.');
});

test('a failed usage login does not claim the runtime cannot authenticate', () => {
    const markup = renderToStaticMarkup(
        <DetectedRuntimeUsage
            detectedRuntimeIds={['claude-code']}
            piAgentCount={null}
            usage={{
                ...usageFixture,
                claude: {
                    error: { code: 'auth', message: 'Unavailable.', name: 'UsageError' },
                    provider: 'claude',
                    status: 'error',
                },
            }}
        />
    );

    expect(markup).toContain('Usage unavailable');
    expect(markup).not.toContain('Authentication failed');
    expect(markup).not.toContain('Plan limits unavailable');
});

test('a retained snapshot whose usage login expired keeps its meters without an execution warning', () => {
    const markup = renderToStaticMarkup(
        <DetectedRuntimeUsage
            detectedRuntimeIds={['claude-code']}
            piAgentCount={null}
            usage={{
                ...usageFixture,
                claude: {
                    provider: 'claude',
                    snapshot: {
                        capturedAt: usageFixture.capturedAt,
                        extraUsage: null,
                        provider: 'claude',
                        source: 'anthropic-oauth-usage',
                        subscriptionType: 'max',
                        windows: [
                            {
                                id: 'current-week-all-models',
                                label: 'Weekly Limit',
                                remainingPercent: 72,
                                resetsAt: '2026-08-21T15:00:00.000Z',
                                usedPercent: 28,
                            },
                        ],
                    },
                    stale: { at: '2026-08-14T15:15:00.000Z', code: 'auth' },
                    status: 'ok',
                },
            }}
        />
    );

    expect(markup).toContain('28%');
    expect(markup).toContain('Usage unavailable');
    expect(markup).not.toContain('Authentication failed');
    expect(markup).not.toContain('Usage out of date');
    expect(markup).toContain('Last updated');
});

test('a retained snapshot kept past a request failure keeps the generic stale copy', () => {
    // A fresh capture whose window has not reset yet: the retention stamp is the
    // only thing that can produce the label, so the assertion tests it.
    const markup = renderCodexWindows(
        [
            {
                id: 'current-week',
                label: 'Current week',
                remainingPercent: 87,
                resetAfterSeconds: 3600,
                resetsAt: new Date(Date.now() + 3_600_000).toISOString(),
                usedPercent: 13,
            },
        ],
        {
            capturedAt: new Date(Date.now() - 60_000).toISOString(),
            stale: { at: '2026-08-14T15:15:00.000Z', code: 'request' },
        }
    );

    expect(markup).toContain('13%');
    expect(markup).toContain('Usage unavailable');
    expect(markup).not.toContain('Authentication failed');
});

test('a fresh snapshot with no retention stamp carries no stale copy', () => {
    const markup = renderCodexWindows(
        [
            {
                id: 'current-week',
                label: 'Current week',
                remainingPercent: 87,
                resetAfterSeconds: 3600,
                resetsAt: new Date(Date.now() + 3_600_000).toISOString(),
                usedPercent: 13,
            },
        ],
        { capturedAt: new Date(Date.now() - 60_000).toISOString() }
    );

    expect(markup).toContain('13%');
    expect(markup).not.toContain('Usage out of date');
    expect(markup).toContain('Resets');
});

test('a retained row reports the usage failure once', () => {
    // The Runtime cell's stale stamp owns that copy. The limit cell used to
    // repeat it, printing the same sentence in two adjacent columns.
    const markup = renderCodexWindows([], {
        stale: { at: '2026-08-14T15:15:00.000Z', code: 'auth' },
    });

    expect(markup.split('Usage unavailable')).toHaveLength(2);
    expect(markup).not.toContain('Authentication failed');
    expect(markup).toContain('Codex: usage details');
    expect(markup).toContain('button--icon-only');
});

function renderCodexWindows(
    windows: Extract<UsageOverview['codex'], { status: 'ok' }>['snapshot']['windows'],
    options: {
        capturedAt?: string;
        stale?: Extract<UsageOverview['codex'], { status: 'ok' }>['stale'];
    } = {}
) {
    return renderToStaticMarkup(
        <DetectedRuntimeUsage
            detectedRuntimeIds={['codex']}
            piAgentCount={null}
            usage={{
                ...usageFixture,
                codex: {
                    ...usageFixture.codex,
                    snapshot: {
                        ...usageFixture.codex.snapshot,
                        capturedAt: options.capturedAt ?? usageFixture.codex.snapshot.capturedAt,
                        windows,
                    },
                    stale: options.stale,
                },
            }}
        />
    );
}

test('execution authentication issues override successful usage and stay scoped to their runtime', () => {
    const markup = renderToStaticMarkup(
        <DetectedRuntimeUsage
            computerName="Zach’s Mac mini"
            detectedRuntimeIds={['codex', 'claude-code']}
            piAgentCount={null}
            runtimeIssues={[
                {
                    runtimeId: 'codex',
                    kind: 'authentication',
                    observedAt: new Date().toISOString(),
                },
            ]}
            usage={usageFixture}
        />
    );
    expect(markup).toContain('Codex: authentication details');
    expect(markup).toContain('Claude Code: usage details');
    expect(markup.split('Authentication failed')).toHaveLength(2);
    expect(markup).toContain('13%');
});
