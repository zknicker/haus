import { expect, test } from 'bun:test';
import { serverUsageOverviewSchema, usageReportSchema } from './stats.ts';

const usage = {
    capturedAt: '2026-07-28T20:00:00.000Z',
    claude: {
        error: { code: 'request' as const, message: 'offline', name: 'Error' },
        provider: 'claude' as const,
        status: 'error' as const,
    },
    codex: {
        error: { code: 'request' as const, message: 'offline', name: 'Error' },
        provider: 'codex' as const,
        status: 'error' as const,
    },
    connectedProviders: [],
    grok: {
        error: { code: 'request' as const, message: 'offline', name: 'Error' },
        provider: 'grok' as const,
        status: 'error' as const,
    },
    openRouter: {
        error: null,
        overview: {
            days: 0,
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
    runtimeUsage: [
        {
            runtimeId: 'grok-build' as const,
            snapshot: {
                capturedAt: '2026-07-28T20:00:00.000Z',
                days: 30 as const,
                models: [
                    {
                        cacheReadTokens: 80,
                        cacheWriteTokens: 0,
                        inputTokens: 100,
                        modelId: 'grok-4.6-build',
                        outputTokens: 20,
                        totalTokens: 120,
                    },
                ],
                runtimeId: 'grok-build' as const,
                source: 'grok-build-jsonl' as const,
                totals: {
                    cacheReadTokens: 80,
                    cacheWriteTokens: 0,
                    inputTokens: 100,
                    outputTokens: 20,
                    totalTokens: 120,
                },
            },
            status: 'ok' as const,
        },
    ],
};

test('Computer usage reports carry one validated snapshot', () => {
    expect(
        usageReportSchema.parse({
            type: 'usage-report',
            usage,
        })
    ).toEqual({ type: 'usage-report', usage });
});

test('Server usage reads keep every Computer and its latest durable snapshot', () => {
    expect(() =>
        serverUsageOverviewSchema.parse({
            computers: [
                {
                    architecture: 'arm64',
                    computerId: 'cmp_1234567890123456',
                    health: 'offline',
                    operatingSystem: 'darwin',
                    productVersion: '1.0.0',
                    reportedAt: '2026-07-28T20:00:01.000Z',
                    usage,
                },
                {
                    architecture: null,
                    computerId: 'cmp_6543210987654321',
                    health: 'healthy',
                    operatingSystem: null,
                    productVersion: null,
                    reportedAt: null,
                    usage: null,
                },
            ],
            tokenUsage: {
                breakdown: [],
                days: 90,
                totals: {
                    cacheReadTokens: 0,
                    cacheWriteTokens: 0,
                    inputTokens: 0,
                    outputTokens: 0,
                    totalTokens: 0,
                },
            },
        })
    ).not.toThrow();
});
