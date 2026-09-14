import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { UsageOverview } from '@haus/api';
import { createComputerUsageCache } from './computer-usage-cache.ts';

test('a fresh Computer usage cache avoids provider reads across restarts', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-cache-'));
    let calls = 0;
    const load = async () => {
        calls += 1;
        return usageAt('2026-08-14T15:00:00.000Z');
    };
    const firstProcess = createComputerUsageCache({ dataRoot, load });
    await firstProcess({ now: () => new Date('2026-08-14T15:00:00.000Z') });

    const restartedProcess = createComputerUsageCache({ dataRoot, load });
    const cached = await restartedProcess({
        now: () => new Date('2026-08-14T15:01:00.000Z'),
    });

    expect(cached.capturedAt).toBe('2026-08-14T15:00:00.000Z');
    expect(calls).toBe(1);
});

test('a stale cache refreshes once for concurrent readers', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-cache-'));
    let calls = 0;
    const read = createComputerUsageCache({
        dataRoot,
        load: async ({ now } = {}) => {
            calls += 1;
            await Promise.resolve();
            return usageAt((now?.() ?? new Date()).toISOString());
        },
        refreshIntervalMs: 1,
    });
    const now = () => new Date('2026-08-14T15:00:00.000Z');

    await Promise.all([read({ now }), read({ now })]);

    expect(calls).toBe(1);
});

test('manual refresh replaces a fresh snapshot and coalesces concurrent requests', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-refresh-'));
    let calls = 0;
    const read = createComputerUsageCache({
        dataRoot,
        load: async ({ now } = {}) => {
            calls += 1;
            await Promise.resolve();
            return usageAt((now?.() ?? new Date()).toISOString());
        },
    });
    await read({ now: () => new Date('2026-08-14T15:00:00.000Z') });
    const now = () => new Date('2026-08-14T15:01:00.000Z');
    const refreshed = await Promise.all([read({ now }, 'refresh'), read({ now }, 'refresh')]);
    expect(refreshed.map((value) => value.capturedAt)).toEqual([
        now().toISOString(),
        now().toISOString(),
    ]);
    expect((await read({ now })).capturedAt).toBe(now().toISOString());
    expect(calls).toBe(2);
});

test('a transient provider failure retains only that provider last-good snapshot', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-cache-'));
    let calls = 0;
    const read = createComputerUsageCache({
        dataRoot,
        load: async ({ now } = {}) => {
            calls += 1;
            if (calls === 1) {
                return usageAt((now?.() ?? new Date()).toISOString());
            }
            const usage = usageAt((now?.() ?? new Date()).toISOString());
            usage.codex = {
                error: { code: 'request', message: 'Unavailable.', name: 'UsageError' },
                provider: 'codex',
                status: 'error',
            };
            usage.connectedProviders = [];
            return usage;
        },
        refreshIntervalMs: 1,
    });
    await read({ now: () => new Date('2026-08-14T15:00:00.000Z') });

    const refreshed = await read({ now: () => new Date('2026-08-14T15:01:00.000Z') });

    expect(refreshed.codex.status).toBe('ok');
    expect(refreshed.connectedProviders).toContain('openai-codex');
});

test('an authentication failure retains the cached provider snapshot', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-cache-'));
    let calls = 0;
    const read = createComputerUsageCache({
        dataRoot,
        load: async ({ now } = {}) => {
            calls += 1;
            const usage = usageAt((now?.() ?? new Date()).toISOString());
            if (calls > 1) {
                usage.codex = {
                    error: { code: 'auth', message: 'Signed out.', name: 'UsageError' },
                    provider: 'codex',
                    status: 'error',
                };
            }
            return usage;
        },
        refreshIntervalMs: 1,
    });
    await read({ now: () => new Date('2026-08-14T15:00:00.000Z') });

    const refreshed = await read({ now: () => new Date('2026-08-14T15:01:00.000Z') });

    expect(refreshed.codex.status).toBe('ok');
    expect(refreshed.connectedProviders).toContain('openai-codex');
});

function usageAt(capturedAt: string): UsageOverview {
    return {
        capturedAt,
        claude: {
            error: { code: 'auth', message: 'Unavailable.', name: 'UsageError' },
            provider: 'claude',
            status: 'error',
        },
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
        grok: {
            error: { code: 'auth', message: 'Unavailable.', name: 'UsageError' },
            provider: 'grok',
            status: 'error',
        },
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
