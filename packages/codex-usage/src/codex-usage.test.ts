import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
    CodexUsageAuthError,
    decodeCodexAccessTokenMetadata,
    getCodexUsage,
    parseCodexAuthDocument,
    resolveCodexAuthPath,
} from './index.ts';

const tempDirs: string[] = [];

afterEach(async () => {
    await Promise.all(
        tempDirs.splice(0).map(async (tempDir) => rm(tempDir, { force: true, recursive: true }))
    );
});

describe('parseCodexAuthDocument', () => {
    it('parses the Codex auth file shape', () => {
        const parsed = parseCodexAuthDocument({
            last_refresh: '2026-03-10T10:00:00.000Z',
            tokens: {
                access_token: 'access-token',
                account_id: 'account-id',
                refresh_token: 'refresh-token',
            },
        });

        expect(parsed.credentials).toEqual({
            accessToken: 'access-token',
            accountId: 'account-id',
            lastRefresh: '2026-03-10T10:00:00.000Z',
            refreshToken: 'refresh-token',
        });
    });
});

describe('decodeCodexAccessTokenMetadata', () => {
    it('reads email and plan from a ChatGPT OAuth access token payload', () => {
        const token = [
            'header',
            Buffer.from(
                JSON.stringify({
                    'https://api.openai.com/auth': {
                        chatgpt_plan_type: 'pro',
                    },
                    'https://api.openai.com/profile': {
                        email: 'operator@example.com',
                    },
                }),
                'utf8'
            ).toString('base64url'),
            'signature',
        ].join('.');

        expect(decodeCodexAccessTokenMetadata(token)).toEqual({
            email: 'operator@example.com',
            planType: 'pro',
        });
    });

    it('returns null when the token is not a readable JWT payload', () => {
        expect(decodeCodexAccessTokenMetadata('not-a-jwt')).toBeNull();
    });
});

describe('getCodexUsage', () => {
    it('reads file credentials without rewriting them', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-usage-'));
        tempDirs.push(tempDir);

        const authPath = resolveCodexAuthPath({ homeDir: tempDir });
        await mkdir(path.dirname(authPath), { recursive: true });
        const rawAuth = JSON.stringify(
            {
                last_refresh: '2026-03-01T00:00:00.000Z',
                tokens: {
                    access_token: 'existing-token',
                    account_id: 'account-id',
                    refresh_token: 'refresh-token',
                },
            },
            null,
            4
        );
        await writeFile(authPath, rawAuth);

        const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
            new Response(
                JSON.stringify({
                    plan_type: 'pro',
                    rate_limit: {
                        primary_window: {
                            reset_after_seconds: 3600,
                            used_percent: 5,
                        },
                    },
                }),
                {
                    headers: {
                        'x-codex-primary-used-percent': '5',
                    },
                    status: 200,
                }
            )
        );

        const usage = await getCodexUsage({
            fetch: fetchMock,
            homeDir: tempDir,
            now: new Date('2026-03-14T00:00:00.000Z'),
        });

        expect(usage.windows[0]).toMatchObject({
            id: 'current-session',
            usedPercent: 5,
        });

        expect(await readFile(authPath, 'utf8')).toBe(rawAuth);
        expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('treats auth failures as expired login state', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'codex-usage-'));
        tempDirs.push(tempDir);

        const authPath = resolveCodexAuthPath({ homeDir: tempDir });
        await mkdir(path.dirname(authPath), { recursive: true });
        await writeFile(
            authPath,
            JSON.stringify(
                {
                    last_refresh: '2026-03-01T00:00:00.000Z',
                    tokens: {
                        access_token: 'stale-token',
                        account_id: 'account-id',
                        refresh_token: 'refresh-token',
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
            getCodexUsage({
                fetch: fetchMock,
                homeDir: tempDir,
                now: new Date('2026-03-14T00:00:00.000Z'),
            })
        ).rejects.toBeInstanceOf(CodexUsageAuthError);

        expect(fetchMock).toHaveBeenCalledTimes(1);
    });
});
