import { renderToStaticMarkup } from 'react-dom/server';
import { expect, test } from 'vitest';
import { ComputerUsageCapacityView } from './computer-usage-capacity.tsx';
import { computerWith, usageFixture as usage } from './usage-fixtures.ts';

test('keeps a Computer plan snapshot visible while the Computer is offline', () => {
    const markup = renderToStaticMarkup(
        <ComputerUsageCapacityView
            computer={computerWith({ health: 'offline' })}
            detectedRuntimeIds={['codex']}
        />
    );

    expect(markup).toContain('Codex');
    expect(markup).toContain('Weekly Limit');
    expect(markup).not.toContain('5h Limit');
    expect(markup).toContain('13%');
    expect(markup).toContain('Usage out of date');
    expect(markup).toContain('Last updated');
    expect(markup).not.toContain('Pi');
});

test('renders only detected runtime cards without token details', () => {
    const markup = renderToStaticMarkup(
        <ComputerUsageCapacityView
            computer={computerWith({
                usage: {
                    ...usage,
                    claude: {
                        provider: 'claude',
                        snapshot: {
                            capturedAt: usage.capturedAt,
                            extraUsage: null,
                            provider: 'claude',
                            source: 'anthropic-oauth-usage',
                            subscriptionType: 'max',
                            windows: [
                                {
                                    id: 'current-session',
                                    label: 'Current session',
                                    remainingPercent: 89,
                                    resetsAt: '2026-08-14T17:00:00.000Z',
                                    usedPercent: 11,
                                },
                                {
                                    id: 'current-week-all-models',
                                    label: 'Weekly Limit',
                                    remainingPercent: 72,
                                    resetsAt: null,
                                    usedPercent: 28,
                                },
                            ],
                        },
                        status: 'ok',
                    },
                    connectedProviders: ['claude-code', 'grok-build'],
                    grok: {
                        provider: 'grok',
                        snapshot: {
                            capturedAt: usage.capturedAt,
                            provider: 'grok',
                            source: 'grok-build-credits',
                            windows: [
                                {
                                    id: 'current-period',
                                    label: 'Weekly Limit',
                                    remainingPercent: 91,
                                    resetsAt: null,
                                    usedPercent: 9,
                                },
                            ],
                        },
                        status: 'ok',
                    },
                    runtimeUsage: [
                        runtimeTokens(
                            'claude-code',
                            'claude-code-jsonl',
                            'claude-opus-4-1',
                            120_000
                        ),
                        runtimeTokens('grok-build', 'grok-build-jsonl', 'grok-code-fast-1', 80_000),
                    ],
                },
            })}
            detectedRuntimeIds={['claude-code', 'grok-build']}
        />
    );

    expect(markup).toContain('Claude Code');
    expect(markup).toContain('Grok Build');
    expect(markup).not.toContain('Codex');
    expect(markup).not.toContain('Pi');
    expect(markup).toContain('Weekly Limit');
    expect(markup).toContain('5h limit');
    expect(markup).toContain('>11%<');
    expect(markup).toContain('tooltip__trigger flex');
    // Runtimes render through the same DataGrid as the Agents table on this
    // page, so both share one header, surface, and row treatment.
    expect(markup).toContain('data-slot="data-grid"');
    expect(markup).toContain('Weekly limit');
    expect(markup).toContain('Details');
    // A weekly meter per runtime, plus a burst meter only where the runtime has
    // a 5-hour window; the runtime without one gets an inert track instead of a
    // zero-value bar that would announce "0%".
    expect(markup.match(/role="progressbar"/g)).toHaveLength(3);
    expect(markup).toContain('No 5-hour limit');
    expect(markup).toContain('5-hour limit, 11% used.');
    expect(markup).not.toContain('auto-rows-fr');
    expect(markup).not.toContain('30-day processed tokens');
    expect(markup).not.toContain('claude-opus-4-1');
    expect(markup).not.toContain('grok-code-fast-1');
    expect(markup).not.toContain('OpenRouter');
});

test('represents Pi as a detected runtime with a filtered Agent usage link', () => {
    const markup = renderToStaticMarkup(
        <ComputerUsageCapacityView
            computer={computerWith({
                usage: {
                    ...usage,
                    connectedProviders: ['openrouter'],
                    openRouter: {
                        error: null,
                        overview: {
                            ...usage.openRouter.overview,
                            status: 'ready',
                        },
                        status: 'ok',
                    },
                },
            })}
            detectedRuntimeIds={['pi']}
            onViewPiUsage={() => undefined}
            piAgentCount={2}
        />
    );

    expect(markup).toContain('Pi');
    expect(markup).toContain('API-backed · 2 Agents');
    expect(markup).toContain('View usage');
    expect(markup).not.toContain('OpenRouter');
});

test('explains when a Computer has not reported usage', () => {
    const markup = renderToStaticMarkup(
        <ComputerUsageCapacityView
            computer={computerWith({ reportedAt: null, usage: null })}
            detectedRuntimeIds={['codex']}
        />
    );

    expect(markup).toContain('Collecting usage');
    expect(markup).toContain('first usage report');
});

function runtimeTokens(
    runtimeId: 'claude-code' | 'grok-build',
    source: 'claude-code-jsonl' | 'grok-build-jsonl',
    modelId: string,
    totalTokens: number
) {
    const totals = {
        cacheReadTokens: 0,
        cacheWriteTokens: 0,
        inputTokens: totalTokens - 1000,
        outputTokens: 1000,
        totalTokens,
    };
    return {
        runtimeId,
        snapshot: {
            capturedAt: usage.capturedAt,
            days: 30 as const,
            models: [{ modelId, ...totals }],
            runtimeId,
            source,
            totals,
        },
        status: 'ok' as const,
    };
}
