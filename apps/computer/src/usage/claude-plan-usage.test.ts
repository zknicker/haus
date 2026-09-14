import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeUsageRequestError, type ClaudeUsageSnapshot } from '@haus/claude-usage';
import { createClaudePlanUsageReader } from './claude-plan-usage.ts';
import {
    claimClaudeSdkUsageRefresh,
    saveClaudePlanUsageSnapshot,
} from './claude-plan-usage-state.ts';

const snapshot: ClaudeUsageSnapshot = {
    capturedAt: '2026-08-14T15:00:00.000Z',
    extraUsage: null,
    provider: 'claude',
    source: 'anthropic-oauth-usage',
    subscriptionType: 'max',
    windows: [],
};

test('reuses Claude plan usage inside the refresh interval', async () => {
    let calls = 0;
    const read = createClaudePlanUsageReader({
        load: async () => {
            calls += 1;
            return snapshot;
        },
        refreshIntervalMs: 900_000,
    });

    await read({ now: new Date('2026-08-14T15:00:00.000Z') });
    expect(await read({ now: new Date('2026-08-14T15:01:00.000Z') })).toBe(snapshot);
    expect(calls).toBe(1);
});

test('coalesces concurrent Claude plan reads', async () => {
    let calls = 0;
    const read = createClaudePlanUsageReader({
        load: async () => {
            calls += 1;
            await Promise.resolve();
            return snapshot;
        },
    });
    const now = new Date('2026-08-14T15:00:00.000Z');

    const [first, second] = await Promise.all([read({ now }), read({ now })]);

    expect(first).toBe(snapshot);
    expect(second).toBe(snapshot);
    expect(calls).toBe(1);
});

test('a rate-limited Claude plan read backs off instead of replaying its last snapshot', async () => {
    let calls = 0;
    const read = createClaudePlanUsageReader({
        load: async () => {
            calls += 1;
            if (calls === 1) {
                return snapshot;
            }
            throw new ClaudeUsageRequestError('rate limited', 429, 1_200_000);
        },
        refreshIntervalMs: 900_000,
    });

    await read({ now: new Date('2026-08-14T15:00:00.000Z') });
    // Retention belongs to the aggregate usage cache, which can say why it is
    // showing last-known numbers. The reader only reports what it just learned.
    await expect(read({ now: new Date('2026-08-14T15:16:00.000Z') })).rejects.toThrow(
        'rate limited'
    );
    await expect(read({ now: new Date('2026-08-14T15:30:00.000Z') })).rejects.toThrow(
        'rate limited'
    );
    expect(calls).toBe(2);
});

test('an in-memory snapshot older than the refresh interval is re-requested', async () => {
    let calls = 0;
    const read = createClaudePlanUsageReader({
        load: async () => {
            calls += 1;
            return { ...snapshot, capturedAt: '2026-08-14T14:00:00.000Z' };
        },
        refreshIntervalMs: 900_000,
    });

    await read({ now: new Date('2026-08-14T15:00:00.000Z') });
    await read({ now: new Date('2026-08-14T15:05:00.000Z') });

    expect(calls).toBe(2);
});

test('uses managed Claude SDK evidence without calling the OAuth fallback', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-claude-plan-'));
    await saveClaudePlanUsageSnapshot(dataRoot, {
        ...snapshot,
        source: 'claude-code-sdk-usage',
    });
    let calls = 0;
    const read = createClaudePlanUsageReader({
        load: async () => {
            calls += 1;
            return snapshot;
        },
    });

    const result = await read({
        dataRoot,
        now: new Date('2026-08-14T15:01:00.000Z'),
    });

    expect(result.source).toBe('claude-code-sdk-usage');
    expect(calls).toBe(0);
});

test('persists fallback backoff across reader instances', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-claude-plan-'));
    let calls = 0;
    const load = async (): Promise<ClaudeUsageSnapshot> => {
        calls += 1;
        throw new ClaudeUsageRequestError('rate limited', 429, 20 * 60_000);
    };

    await expect(
        createClaudePlanUsageReader({ load })({
            dataRoot,
            now: new Date('2026-08-14T15:00:00.000Z'),
        })
    ).rejects.toThrow('rate limited');
    await expect(
        createClaudePlanUsageReader({ load })({
            dataRoot,
            now: new Date('2026-08-14T15:30:00.000Z'),
        })
    ).rejects.toThrow('waiting for its guarded fallback retry');
    expect(calls).toBe(1);
});

test('leases one Claude SDK usage refresh per interval', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-claude-plan-'));
    const now = new Date('2026-08-14T15:00:00.000Z');

    expect(await claimClaudeSdkUsageRefresh(dataRoot, now)).toBe(true);
    expect(await claimClaudeSdkUsageRefresh(dataRoot, now)).toBe(false);
});

test('refreshes expired persisted usage and serves it only while it is fresh', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-claude-plan-'));
    await saveClaudePlanUsageSnapshot(dataRoot, snapshot);
    const refreshed = { ...snapshot, capturedAt: '2026-09-08T15:00:00.000Z' };
    let calls = 0;
    const load = async () => {
        calls += 1;
        if (calls === 1) {
            return refreshed;
        }
        throw new ClaudeUsageRequestError('rate limited', 429, 1_200_000);
    };
    const read = createClaudePlanUsageReader({ load });
    expect(await read({ dataRoot, now: new Date(refreshed.capturedAt) })).toEqual(refreshed);
    expect(await read({ dataRoot, now: new Date('2026-09-08T15:10:00.000Z') })).toEqual(refreshed);
    expect(calls).toBe(1);
    await expect(read({ dataRoot, now: new Date('2026-09-08T15:16:00.000Z') })).rejects.toThrow(
        'rate limited'
    );
    expect(calls).toBe(2);
    await expect(
        createClaudePlanUsageReader({ load })({
            dataRoot,
            now: new Date('2026-09-08T15:30:00.000Z'),
        })
    ).rejects.toThrow('waiting for its guarded fallback retry');
    expect(calls).toBe(2);
});

test('a manual refresh retries Claude plan usage inside the guarded backoff', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-claude-plan-'));
    let calls = 0;
    const load = async (): Promise<ClaudeUsageSnapshot> => {
        calls += 1;
        if (calls === 1) {
            throw new ClaudeUsageRequestError('rate limited', 429, 20 * 60_000);
        }
        return snapshot;
    };

    await expect(
        createClaudePlanUsageReader({ load })({
            dataRoot,
            now: new Date('2026-08-14T15:00:00.000Z'),
        })
    ).rejects.toThrow('rate limited');
    expect(
        await createClaudePlanUsageReader({ load })({
            dataRoot,
            force: true,
            now: new Date('2026-08-14T15:05:00.000Z'),
        })
    ).toBe(snapshot);
    expect(calls).toBe(2);
});

test('a failed manual refresh re-arms the Claude fallback backoff', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-claude-plan-'));
    let calls = 0;
    const load = async (): Promise<ClaudeUsageSnapshot> => {
        calls += 1;
        throw new ClaudeUsageRequestError('rate limited', 429, 20 * 60_000);
    };

    await expect(
        createClaudePlanUsageReader({ load })({
            dataRoot,
            now: new Date('2026-08-14T15:00:00.000Z'),
        })
    ).rejects.toThrow('rate limited');
    await expect(
        createClaudePlanUsageReader({ load })({
            dataRoot,
            force: true,
            now: new Date('2026-08-14T15:05:00.000Z'),
        })
    ).rejects.toThrow('rate limited');
    expect(calls).toBe(2);
    await expect(
        createClaudePlanUsageReader({ load })({
            dataRoot,
            now: new Date('2026-08-14T15:10:00.000Z'),
        })
    ).rejects.toThrow('waiting for its guarded fallback retry');
    expect(calls).toBe(2);
});
