import { expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ClaudeUsageAuthError, ClaudeUsageRequestError } from '@haus/claude-usage';
import { createComputerUsageCache } from './computer-usage-cache.ts';
import { readComputerUsage } from './read-usage.ts';
import { claudeOnlyReadOptions, claudeSnapshotAt, usageAt } from './usage-overview-fixtures.ts';

test('a transient provider failure retains only that provider last-good snapshot', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-cache-'));
    let calls = 0;
    const read = createComputerUsageCache({
        dataRoot,
        load: async ({ now } = {}) => {
            calls += 1;
            const usage = usageAt((now?.() ?? new Date()).toISOString());
            if (calls > 1) {
                usage.codex = {
                    error: { code: 'request', message: 'Unavailable.', name: 'UsageError' },
                    provider: 'codex',
                    status: 'error',
                };
                usage.connectedProviders = [];
            }
            return usage;
        },
        refreshIntervalMs: 1,
    });
    await read({ now: () => new Date('2026-08-14T15:00:00.000Z') });

    const refreshed = await read({ now: () => new Date('2026-08-14T15:01:00.000Z') });

    expect(refreshed.codex).toMatchObject({
        snapshot: { capturedAt: '2026-08-14T15:00:00.000Z' },
        stale: { at: '2026-08-14T15:01:00.000Z', code: 'request' },
        status: 'ok',
    });
    expect(refreshed.connectedProviders).toContain('openai-codex');
});

test('a provider that recovers drops its retention stamp', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-cache-'));
    let calls = 0;
    const read = createComputerUsageCache({
        dataRoot,
        load: async ({ now } = {}) => {
            calls += 1;
            const usage = usageAt((now?.() ?? new Date()).toISOString());
            if (calls === 2) {
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
    const signedOut = await read({ now: () => new Date('2026-08-14T15:01:00.000Z') });
    expect(signedOut.codex).toMatchObject({ stale: { code: 'auth' }, status: 'ok' });

    const recovered = await read({ now: () => new Date('2026-08-14T15:02:00.000Z') });

    expect(recovered.codex.status).toBe('ok');
    expect(recovered.codex).not.toHaveProperty('stale');
});

test('a Computer that has never read Claude usage reports the failure itself', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-auth-'));
    const read = createComputerUsageCache({
        dataRoot,
        load: async ({ now } = {}) =>
            readComputerUsage({
                ...claudeOnlyReadOptions(async () => {
                    throw new ClaudeUsageAuthError('No Claude Code session is available.');
                }),
                now,
            }),
    });

    const usage = await read({ now: () => new Date('2026-08-14T15:00:00.000Z') });

    expect(usage.claude).toMatchObject({ error: { code: 'auth' }, status: 'error' });
    expect(usage.connectedProviders).not.toContain('claude-code');
});

test('an expired Claude login keeps its last plan snapshot and says why', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-auth-'));
    let calls = 0;
    const read = createComputerUsageCache({
        dataRoot,
        load: async ({ now } = {}) => {
            calls += 1;
            const capturedAt = (now?.() ?? new Date()).toISOString();
            return readComputerUsage({
                ...claudeOnlyReadOptions(async () => {
                    if (calls > 1) {
                        throw new ClaudeUsageAuthError('No Claude Code session is available.');
                    }
                    return claudeSnapshotAt(capturedAt);
                }),
                now,
            });
        },
        refreshIntervalMs: 1,
    });
    await read({ now: () => new Date('2026-08-14T15:00:00.000Z') });

    const refreshed = await read({ now: () => new Date('2026-08-14T15:01:00.000Z') });

    expect(refreshed.claude).toMatchObject({
        snapshot: { capturedAt: '2026-08-14T15:00:00.000Z' },
        stale: { at: '2026-08-14T15:01:00.000Z', code: 'auth' },
        status: 'ok',
    });
    expect(refreshed.connectedProviders).toContain('claude-code');
});

test('a guarded Claude backoff keeps the last Claude plan snapshot', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-usage-backoff-'));
    let calls = 0;
    const read = createComputerUsageCache({
        dataRoot,
        load: async ({ now } = {}) => {
            calls += 1;
            const capturedAt = (now?.() ?? new Date()).toISOString();
            return readComputerUsage({
                ...claudeOnlyReadOptions(async () => {
                    if (calls > 1) {
                        throw new ClaudeUsageRequestError(
                            'Claude plan usage is waiting for its guarded fallback retry.',
                            429,
                            600_000
                        );
                    }
                    return claudeSnapshotAt(capturedAt);
                }),
                now,
            });
        },
        refreshIntervalMs: 1,
    });
    await read({ now: () => new Date('2026-08-14T15:00:00.000Z') });

    const refreshed = await read({ now: () => new Date('2026-08-14T15:01:00.000Z') });

    expect(refreshed.claude).toMatchObject({ stale: { code: 'request' }, status: 'ok' });
    expect(refreshed.connectedProviders).toContain('claude-code');
});
