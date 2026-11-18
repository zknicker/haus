import { expect, test } from 'bun:test';
import { ClaudeUsageRequestError } from '@haus/claude-usage';
import { readComputerUsage } from './read-usage.ts';

test('Computer reports only provider usage sources it can actually read', async () => {
    const usage = await readComputerUsage({
        loadClaudeUsage: async () => ({
            capturedAt: '2026-07-28T20:00:00.000Z',
            extraUsage: null,
            provider: 'claude',
            source: 'anthropic-oauth-usage',
            subscriptionType: 'max',
            windows: [],
        }),
        loadClaudeLocalUsage: async () => null,
        loadCodexUsage: async () => ({
            capturedAt: '2026-07-28T20:00:00.000Z',
            creditsBalance: null,
            planType: 'pro',
            provider: 'codex',
            source: 'chatgpt-wham-usage',
            windows: [],
        }),
        loadGrokLocalUsage: async () => ({
            capturedAt: '2026-07-28T20:00:00.000Z',
            days: 30,
            models: [],
            runtimeId: 'grok-build',
            source: 'grok-build-jsonl',
            totals: {
                cacheReadTokens: 0,
                cacheWriteTokens: 0,
                inputTokens: 100,
                outputTokens: 20,
                totalTokens: 120,
            },
        }),
        loadGrokUsage: async () => ({
            capturedAt: '2026-07-28T20:00:00.000Z',
            provider: 'grok',
            source: 'grok-build-credits',
            windows: [],
        }),
        loadOpenRouterUsage: async () => ({
            days: 30,
            keys: [{ id: 'openai/gpt', label: 'openai/gpt', providerName: 'OpenAI' }],
            message: null,
            note: null,
            series: [],
            status: 'ready',
            totalByokUsageUsd: 0,
            totalRequests: 1,
            totalUsageUsd: 0.1,
        }),
        now: () => new Date('2026-07-28T20:00:00.000Z'),
    });

    expect(usage.codex.status).toBe('ok');
    expect(usage.connectedProviders).toEqual([
        'claude-code',
        'openai-codex',
        'grok-build',
        'openrouter',
    ]);
    expect(usage.runtimeUsage).toHaveLength(1);
});

test('Computer does not claim Codex is connected after an auth/read failure', async () => {
    const usage = await readComputerUsage({
        loadClaudeUsage: async () => {
            throw new Error('No Claude session');
        },
        loadClaudeLocalUsage: async () => null,
        loadCodexUsage: async () => {
            throw new Error('No Codex session');
        },
        loadGrokLocalUsage: async () => null,
        loadGrokUsage: async () => {
            throw new Error('No Grok session');
        },
        loadOpenRouterUsage: async () => ({
            days: 30,
            keys: [],
            message: 'Not configured',
            note: null,
            series: [],
            status: 'unconfigured',
            totalByokUsageUsd: 0,
            totalRequests: 0,
            totalUsageUsd: 0,
        }),
        logUsageFailure: () => undefined,
    });

    expect(usage.codex.status).toBe('error');
    expect(usage.codex).toMatchObject({
        error: {
            message: 'Codex usage is unavailable on this Computer.',
            name: 'UsageError',
        },
    });
    expect(JSON.stringify(usage)).not.toContain('No Codex session');
    expect(usage.connectedProviders).toEqual([]);
});

test('Computer does not claim OpenRouter is connected after a request failure', async () => {
    const usage = await readComputerUsage({
        loadClaudeUsage: async () => {
            throw new Error('No Claude session');
        },
        loadClaudeLocalUsage: async () => null,
        loadCodexUsage: async () => {
            throw new Error('No Codex session');
        },
        loadGrokLocalUsage: async () => null,
        loadGrokUsage: async () => {
            throw new Error('No Grok session');
        },
        loadOpenRouterUsage: async () => {
            throw new Error('OpenRouter unavailable');
        },
        logUsageFailure: () => undefined,
    });

    expect(usage.openRouter.status).toBe('error');
    expect(usage.openRouter.error).toMatchObject({
        message: 'OpenRouter usage is unavailable on this Computer.',
        name: 'UsageError',
    });
    expect(JSON.stringify(usage)).not.toContain('OpenRouter unavailable');
    expect(usage.connectedProviders).toEqual([]);
});

test('Computer classifies an expired Grok login as an authentication failure', async () => {
    const usage = await readComputerUsage({
        loadClaudeUsage: async () => {
            throw new Error('No Claude session');
        },
        loadClaudeLocalUsage: async () => null,
        loadCodexUsage: async () => {
            throw new Error('No Codex session');
        },
        loadGrokLocalUsage: async () => null,
        loadGrokUsage: async () => {
            throw new Error('No current Grok login is available.');
        },
        loadOpenRouterUsage: async () => ({
            days: 30,
            keys: [],
            message: 'Not configured',
            note: null,
            series: [],
            status: 'unconfigured',
            totalByokUsageUsd: 0,
            totalRequests: 0,
            totalUsageUsd: 0,
        }),
        logUsageFailure: () => undefined,
    });

    expect(usage.grok).toMatchObject({
        error: { code: 'auth' },
        status: 'error',
    });
});

test('Computer reports a guarded Claude backoff as a request failure it can retain', async () => {
    const usage = await readComputerUsage({
        loadClaudeUsage: async () => {
            throw new ClaudeUsageRequestError(
                'Claude plan usage is waiting for its guarded fallback retry.',
                429,
                600_000
            );
        },
        loadClaudeLocalUsage: async () => null,
        loadCodexUsage: async () => {
            throw new Error('No Codex session');
        },
        loadGrokLocalUsage: async () => null,
        loadGrokUsage: async () => {
            throw new Error('No Grok session');
        },
        loadOpenRouterUsage: async () => {
            throw new Error('OpenRouter unavailable');
        },
        logUsageFailure: () => undefined,
    });

    expect(usage.claude).toMatchObject({
        error: { code: 'request' },
        status: 'error',
    });
    expect(JSON.stringify(usage)).not.toContain('guarded fallback retry');
});

test('Computer logs one sanitized line per failed provider read', async () => {
    const lines: string[] = [];
    await readComputerUsage({
        loadClaudeUsage: async () => {
            throw new ClaudeUsageRequestError('rate limited by api.anthropic.com', 429);
        },
        loadClaudeLocalUsage: async () => null,
        loadCodexUsage: async () => {
            throw new Error('No Codex session');
        },
        loadGrokLocalUsage: async () => null,
        loadGrokUsage: async () => {
            throw new Error('No current Grok login is available.');
        },
        loadOpenRouterUsage: async () => ({
            days: 30,
            keys: [],
            message: 'Not configured',
            note: null,
            series: [],
            status: 'unconfigured',
            totalByokUsageUsd: 0,
            totalRequests: 0,
            totalUsageUsd: 0,
        }),
        logUsageFailure: (failure) =>
            lines.push(`${failure.provider} ${failure.errorClass} ${failure.code}`),
    });

    expect(lines).toEqual([
        'claude ClaudeUsageRequestError request',
        'codex Error unknown',
        'grok Error auth',
    ]);
});
