import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createComputerUsageCache } from './computer-usage-cache.ts';
import { usageAt } from './usage-overview-fixtures.ts';

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

test('a manual refresh asks providers to bypass their guarded backoff', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-refresh-'));
    const forced: (boolean | undefined)[] = [];
    const read = createComputerUsageCache({
        dataRoot,
        load: async ({ force, now } = {}) => {
            forced.push(force);
            return usageAt((now?.() ?? new Date()).toISOString());
        },
        refreshIntervalMs: 1,
    });

    await read({ now: () => new Date('2026-08-14T15:00:00.000Z') });
    await read({ now: () => new Date('2026-08-14T15:01:00.000Z') }, 'refresh');

    expect(forced).toEqual([false, true]);
});

test('a manual refresh does not inherit an unforced read already in flight', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-refresh-'));
    const forced: (boolean | undefined)[] = [];
    let release: () => void = () => undefined;
    const started = new Promise<void>((resolve) => {
        release = resolve;
    });
    const read = createComputerUsageCache({
        dataRoot,
        load: async ({ force, now } = {}) => {
            forced.push(force);
            if (forced.length === 1) {
                await started;
            }
            return usageAt((now?.() ?? new Date()).toISOString());
        },
        refreshIntervalMs: 1,
    });

    const background = read({ now: () => new Date('2026-08-14T15:00:00.000Z') });
    const manual = read({ now: () => new Date('2026-08-14T15:01:00.000Z') }, 'refresh');
    release();
    const [cached, refreshed] = await Promise.all([background, manual]);

    expect(forced).toEqual([false, true]);
    expect(cached.capturedAt).toBe('2026-08-14T15:00:00.000Z');
    expect(refreshed.capturedAt).toBe('2026-08-14T15:01:00.000Z');
});

test('a read that rejects still closes its failure pass', async () => {
    // The pass is what recovery is measured against. A rejected read used to
    // leave it open, so the next pass still saw the failed provider and the
    // recovery line never printed.
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-recovery-'));
    const lines: string[] = [];
    let attempt = 0;
    const read = createComputerUsageCache({
        dataRoot,
        load: async ({ logUsageFailure, now } = {}) => {
            attempt += 1;
            if (attempt <= 2) {
                logUsageFailure?.({ code: 'auth', errorClass: 'UsageError', provider: 'codex' });
            }
            if (attempt === 2) {
                throw new Error('usage read failed');
            }
            return usageAt((now?.() ?? new Date()).toISOString());
        },
        logUsageFailure: (failure) => lines.push(`failed ${failure.provider} ${failure.code}`),
        logUsageRecovery: (provider) => lines.push(`recovered ${provider}`),
        refreshIntervalMs: 1,
    });

    await read({ now: () => new Date('2026-08-14T15:00:00.000Z') });
    await read({ now: () => new Date('2026-08-14T15:01:00.000Z') });
    await read({ now: () => new Date('2026-08-14T15:02:00.000Z') });

    expect(lines).toEqual(['failed codex auth', 'recovered codex']);
});
