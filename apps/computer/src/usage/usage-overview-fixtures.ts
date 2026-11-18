import type { UsageOverview } from '@haus/api';
import type { readComputerUsage } from './read-usage.ts';

/** A Computer whose Codex read succeeded and whose Claude and Grok logins are absent. */
export function usageAt(capturedAt: string): UsageOverview {
    return {
        capturedAt,
        claude: usageError('claude'),
        codex: {
            provider: 'codex',
            snapshot: {
                capturedAt,
                creditsBalance: null,
                planType: 'pro',
                provider: 'codex',
                source: 'chatgpt-wham-usage',
                windows: [],
            },
            status: 'ok',
        },
        connectedProviders: ['openai-codex'],
        grok: usageError('grok'),
        openRouter: { error: null, overview: unconfiguredOpenRouter(), status: 'ok' },
        runtimeUsage: [],
    };
}

export function claudeSnapshotAt(
    capturedAt: string
): Extract<UsageOverview['claude'], { status: 'ok' }>['snapshot'] {
    return {
        capturedAt,
        extraUsage: null,
        provider: 'claude',
        source: 'anthropic-oauth-usage',
        subscriptionType: 'max',
        windows: [],
    };
}

function unconfiguredOpenRouter() {
    return {
        days: 30,
        keys: [],
        message: 'Not configured',
        note: null,
        series: [],
        status: 'unconfigured' as const,
        totalByokUsageUsd: 0,
        totalRequests: 0,
        totalUsageUsd: 0,
    };
}

/** Every provider but Claude absent, so a test can speak about Claude alone. */
export function claudeOnlyReadOptions(
    loadClaudeUsage: NonNullable<Parameters<typeof readComputerUsage>[0]>['loadClaudeUsage']
): Parameters<typeof readComputerUsage>[0] {
    return {
        loadClaudeLocalUsage: async () => null,
        loadClaudeUsage,
        loadCodexUsage: async () => {
            throw new Error('No Codex session');
        },
        loadGrokLocalUsage: async () => null,
        loadGrokUsage: async () => {
            throw new Error('No Grok session');
        },
        loadOpenRouterUsage: async () => unconfiguredOpenRouter(),
        logUsageFailure: () => undefined,
    };
}

function usageError<T extends 'claude' | 'grok'>(provider: T) {
    return {
        error: { code: 'auth' as const, message: 'Unavailable.', name: 'UsageError' },
        provider,
        status: 'error' as const,
    };
}
