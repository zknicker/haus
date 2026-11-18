import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    ClaudeUsageAuthError,
    getClaudeUsage,
    normalizeClaudeUsageResponse,
    resolveClaudeCredentialsPath,
} from './index.ts';

const tempDirs: string[] = [];

afterEach(async () => {
    await Promise.all(
        tempDirs.splice(0).map(async (tempDir) => rm(tempDir, { force: true, recursive: true }))
    );
});

describe('normalizeClaudeUsageResponse', () => {
    it('normalizes current session, weekly, and extra usage fields', () => {
        const snapshot = normalizeClaudeUsageResponse(
            {
                extra_usage: {
                    is_enabled: true,
                    monthly_limit: 5000,
                    used_credits: 123,
                },
                five_hour: {
                    resets_at: '2026-03-14T19:00:00.000Z',
                    utilization: 3,
                },
                seven_day: {
                    resets_at: '2026-03-21T00:00:00.000Z',
                    utilization: 19,
                },
                seven_day_sonnet: {
                    resets_at: '2026-03-21T00:00:00.000Z',
                    utilization: 45,
                },
            },
            {
                capturedAt: new Date('2026-03-14T15:00:00.000Z'),
                subscriptionType: 'claude_max',
            }
        );

        expect(snapshot).toEqual({
            capturedAt: '2026-03-14T15:00:00.000Z',
            extraUsage: {
                monthlyLimitUsd: 50,
                usedUsd: 1.23,
            },
            provider: 'claude',
            source: 'anthropic-oauth-usage',
            subscriptionType: 'claude_max',
            windows: [
                {
                    id: 'current-session',
                    label: 'Current session',
                    remainingPercent: 97,
                    resetsAt: '2026-03-14T19:00:00.000Z',
                    usedPercent: 3,
                },
                {
                    id: 'current-week-all-models',
                    label: 'Current week (all models)',
                    remainingPercent: 81,
                    resetsAt: '2026-03-21T00:00:00.000Z',
                    usedPercent: 19,
                },
                {
                    id: 'current-week-sonnet',
                    label: 'Current week (Sonnet only)',
                    remainingPercent: 55,
                    resetsAt: '2026-03-21T00:00:00.000Z',
                    usedPercent: 45,
                },
            ],
        });
    });
});

describe('getClaudeUsage', () => {
    it('reads file credentials without rewriting them', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-usage-'));
        tempDirs.push(tempDir);

        const credentialsPath = resolveClaudeCredentialsPath({ homeDir: tempDir });
        await mkdir(path.dirname(credentialsPath), { recursive: true });
        const rawCredentials = JSON.stringify(
            {
                claudeAiOauth: {
                    accessToken: 'existing-token',
                    expiresAt: new Date('2026-03-14T13:00:00.000Z').getTime(),
                    refreshToken: 'refresh-token',
                    subscriptionType: 'claude_max',
                },
            },
            null,
            4
        );
        await writeFile(credentialsPath, rawCredentials);

        const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    five_hour: {
                        resets_at: '2026-03-14T19:00:00.000Z',
                        utilization: 3,
                    },
                }),
                { status: 200 }
            )
        );

        const usage = await getClaudeUsage({
            fetch: fetchMock,
            homeDir: tempDir,
            now: new Date('2026-03-14T12:00:00.000Z'),
            useKeychain: false,
        });

        expect(usage.windows[0]).toMatchObject({
            id: 'current-session',
            usedPercent: 3,
        });

        expect(await readFile(credentialsPath, 'utf8')).toBe(rawCredentials);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('treats auth failures as expired login state', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-usage-'));
        tempDirs.push(tempDir);

        const credentialsPath = resolveClaudeCredentialsPath({ homeDir: tempDir });
        await mkdir(path.dirname(credentialsPath), { recursive: true });
        await writeFile(
            credentialsPath,
            JSON.stringify(
                {
                    claudeAiOauth: {
                        accessToken: 'expired-token',
                        expiresAt: new Date('2026-03-14T13:00:00.000Z').getTime(),
                        refreshToken: 'refresh-token',
                        subscriptionType: 'claude_max',
                    },
                },
                null,
                4
            )
        );

        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(new Response(null, { status: 401 }));

        await expect(
            getClaudeUsage({
                fetch: fetchMock,
                homeDir: tempDir,
                now: new Date('2026-03-14T12:00:00.000Z'),
                useKeychain: false,
            })
        ).rejects.toBeInstanceOf(ClaudeUsageAuthError);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('names the refresh as the remedy for an expired session instead of calling the API', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-usage-'));
        tempDirs.push(tempDir);
        const fetchMock = vi.fn<typeof fetch>();

        await expect(
            getClaudeUsage({
                fetch: fetchMock,
                homeDir: tempDir,
                now: new Date('2026-08-14T00:00:00.000Z'),
                platform: 'darwin',
                readKeychain: async () =>
                    JSON.stringify({
                        claudeAiOauth: {
                            accessToken: 'expired-keychain-token',
                            expiresAt: Date.parse('2026-08-13T00:00:00.000Z'),
                            refreshToken: 'keychain-refresh-token',
                        },
                    }),
            })
        ).rejects.toThrow('Run `claude` once to refresh it.');

        expect(fetchMock).not.toHaveBeenCalled();
    });

    it('preserves provider retry timing on rate limits', async () => {
        const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
            new Response(null, {
                headers: { 'retry-after': '679' },
                status: 429,
            })
        );

        await expect(
            getClaudeUsage({
                credentials: {
                    accessToken: 'access-token',
                    expiresAt: null,
                    refreshToken: null,
                    subscriptionType: 'claude_max',
                },
                fetch: fetchMock,
                now: new Date('2026-03-14T12:00:00.000Z'),
            })
        ).rejects.toMatchObject({
            retryAfterMs: 679_000,
            status: 429,
        });
    });

    it('loads credentials from Keychain when the file is absent', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-usage-'));
        tempDirs.push(tempDir);

        const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    five_hour: {
                        resets_at: '2026-03-14T19:00:00.000Z',
                        utilization: 3,
                    },
                }),
                { status: 200 }
            )
        );

        const usage = await getClaudeUsage({
            fetch: fetchMock,
            homeDir: tempDir,
            readKeychain: async () =>
                JSON.stringify({
                    claudeAiOauth: {
                        accessToken: 'keychain-token',
                        subscriptionType: 'claude_max',
                    },
                }),
            useKeychain: true,
        });

        expect(usage.subscriptionType).toBe('claude_max');
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
