import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
    loadClaudeCredentials,
    parseClaudeCredentialsDocument,
    resolveClaudeCredentialsPath,
} from './index.ts';

const tempDirs: string[] = [];

afterEach(async () => {
    await Promise.all(
        tempDirs.splice(0).map(async (tempDir) => rm(tempDir, { force: true, recursive: true }))
    );
});

describe('loadClaudeCredentials', () => {
    it('reads a current credential file without requiring macOS Keychain access', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-usage-'));
        tempDirs.push(tempDir);
        const credentialsPath = path.join(tempDir, 'credentials.json');
        await writeFile(
            credentialsPath,
            JSON.stringify({
                claudeAiOauth: { accessToken: 'file-token', expiresAt: Date.now() + 60_000 },
            })
        );
        const loaded = await loadClaudeCredentials({
            credentialsPath,
            platform: 'darwin',
            readKeychain: () => {
                throw Object.assign(new Error('User interaction is not allowed'), { code: 36 });
            },
        });
        expect(loaded?.credentials.accessToken).toBe('file-token');
    });

    it('prefers a current macOS Keychain session over a stale credential file', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-usage-'));
        tempDirs.push(tempDir);
        const credentialsPath = resolveClaudeCredentialsPath({ homeDir: tempDir });
        await mkdir(path.dirname(credentialsPath), { recursive: true });
        await writeFile(
            credentialsPath,
            JSON.stringify({
                claudeAiOauth: {
                    accessToken: 'stale-file-token',
                    expiresAt: Date.parse('2026-08-13T00:00:00.000Z'),
                },
            })
        );

        const loaded = await loadClaudeCredentials({
            homeDir: tempDir,
            now: new Date('2026-08-14T00:00:00.000Z'),
            platform: 'darwin',
            readKeychain: async () =>
                JSON.stringify({
                    claudeAiOauth: {
                        accessToken: 'current-keychain-token',
                        expiresAt: Date.parse('2026-08-15T00:00:00.000Z'),
                    },
                }),
        });

        expect(loaded?.source).toBe('keychain');
        expect(loaded?.credentials.accessToken).toBe('current-keychain-token');
        expect(loaded?.expired).toBe(false);
    });

    it('keeps an expired session the CLI can still refresh', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-usage-'));
        tempDirs.push(tempDir);
        const loaded = await loadClaudeCredentials({
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
        });

        expect(loaded?.source).toBe('keychain');
        expect(loaded?.credentials.accessToken).toBe('expired-keychain-token');
        expect(loaded?.expired).toBe(true);
    });

    it('reports no login when an expired session has nothing left to refresh with', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-usage-'));
        tempDirs.push(tempDir);
        const loaded = await loadClaudeCredentials({
            homeDir: tempDir,
            now: new Date('2026-08-14T00:00:00.000Z'),
            platform: 'darwin',
            readKeychain: async () =>
                JSON.stringify({
                    claudeAiOauth: {
                        accessToken: 'expired-keychain-token',
                        expiresAt: Date.parse('2026-08-13T00:00:00.000Z'),
                    },
                }),
        });

        expect(loaded).toBeNull();
    });

    it('falls back past expired credentials instead of sending them', async () => {
        const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-usage-'));
        tempDirs.push(tempDir);
        const credentialsPath = resolveClaudeCredentialsPath({ homeDir: tempDir });
        await mkdir(path.dirname(credentialsPath), { recursive: true });
        await writeFile(
            credentialsPath,
            JSON.stringify({
                claudeAiOauth: {
                    accessToken: 'expired-token',
                    expiresAt: Date.parse('2026-08-13T00:00:00.000Z'),
                },
            })
        );

        const loaded = await loadClaudeCredentials({
            environment: { CLAUDE_CODE_OAUTH_TOKEN: 'environment-token' },
            homeDir: tempDir,
            now: new Date('2026-08-14T00:00:00.000Z'),
            platform: 'linux',
            readKeychain: async () => null,
        });

        expect(loaded?.source).toBe('environment');
    });
});

describe('parseClaudeCredentialsDocument', () => {
    it('parses the Claude Code credential file shape', () => {
        const parsed = parseClaudeCredentialsDocument({
            claudeAiOauth: {
                accessToken: 'access-token',
                expiresAt: 1234,
                refreshToken: 'refresh-token',
                subscriptionType: 'claude_max',
            },
        });

        expect(parsed.credentials).toEqual({
            accessToken: 'access-token',
            expiresAt: 1234,
            refreshToken: 'refresh-token',
            subscriptionType: 'claude_max',
        });
    });
});

it.each([
    'not-json',
    '{"claudeAiOauth":{}}',
])('treats unusable Keychain credentials as an authentication failure: %s', async (raw) => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-usage-'));
    tempDirs.push(tempDir);
    await expect(
        loadClaudeCredentials({
            homeDir: tempDir,
            platform: 'darwin',
            readKeychain: async () => raw,
        })
    ).rejects.toMatchObject({ name: 'ClaudeUsageAuthError' });
});

it('treats an invalid credential file as an authentication failure', async () => {
    const tempDir = await mkdtemp(path.join(os.tmpdir(), 'claude-usage-'));
    tempDirs.push(tempDir);
    const credentialsPath = path.join(tempDir, 'credentials.json');
    await writeFile(credentialsPath, '{}');
    await expect(
        loadClaudeCredentials({ credentialsPath, useKeychain: false })
    ).rejects.toMatchObject({ name: 'ClaudeUsageAuthError' });
});
