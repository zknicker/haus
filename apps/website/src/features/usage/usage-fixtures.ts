import type { ComputerUsage } from '@haus/api';

/** A Computer whose Codex weekly window reported and whose other logins did not. */
export const usageFixture = {
    capturedAt: '2026-08-14T15:00:00.000Z',
    claude: providerError('claude'),
    codex: {
        provider: 'codex' as const,
        snapshot: {
            capturedAt: '2026-08-14T15:00:00.000Z',
            creditsBalance: null,
            planType: 'pro',
            provider: 'codex' as const,
            source: 'chatgpt-wham-usage' as const,
            windows: [
                {
                    id: 'current-week' as const,
                    label: 'Current week',
                    remainingPercent: 87,
                    resetAfterSeconds: 3600,
                    resetsAt: '2026-08-14T16:00:00.000Z',
                    usedPercent: 13,
                },
            ],
        },
        status: 'ok' as const,
    },
    connectedProviders: ['openai-codex' as const],
    grok: providerError('grok'),
    openRouter: {
        error: null,
        overview: {
            days: 30,
            keys: [],
            message: null,
            note: null,
            series: [],
            status: 'unconfigured' as const,
            totalByokUsageUsd: 0,
            totalRequests: 0,
            totalUsageUsd: 0,
        },
        status: 'ok' as const,
    },
    runtimeUsage: [],
};

function providerError<T extends 'claude' | 'grok'>(provider: T) {
    return {
        error: { code: 'request' as const, message: 'Unavailable.', name: 'UsageError' },
        provider,
        status: 'error' as const,
    };
}

export function computerWith(overrides: Partial<ComputerUsage> = {}): ComputerUsage {
    return {
        architecture: 'arm64',
        computerId: 'cmp_test',
        health: 'healthy',
        operatingSystem: 'darwin',
        productVersion: '1.4.4',
        reportedAt: usageFixture.capturedAt,
        usage: usageFixture,
        ...overrides,
    };
}
