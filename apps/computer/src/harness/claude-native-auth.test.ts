import { expect, test } from 'bun:test';
import { classifyRuntimeFailure } from '../runtime-failure.ts';
import { claudeNativeEnvironment } from './claude-native-auth.ts';

test('hands the current native login to an isolated Claude process without copying its credential document', async () => {
    let accessToken = 'test-native-token';
    const options = {
        environment: {},
        loadCredentials: async () => ({
            credentials: {
                accessToken,
                expiresAt: null,
                refreshToken: 'test-refresh',
                subscriptionType: 'max',
            },
            document: { private: 'host-only' },
            expired: false,
            path: null,
            source: 'keychain' as const,
        }),
    };
    expect(await claudeNativeEnvironment(options)).toEqual({
        CLAUDE_CODE_OAUTH_TOKEN: accessToken,
    });
    accessToken = 'test-refreshed-token';
    expect(await claudeNativeEnvironment(options)).toEqual({
        CLAUDE_CODE_OAUTH_TOKEN: accessToken,
    });
});

const expiredHostLogin = {
    credentials: {
        accessToken: 'expired-native-token',
        expiresAt: Date.parse('2026-09-18T00:00:00.000Z'),
        refreshToken: 'test-refresh',
        subscriptionType: 'max',
    },
    document: { private: 'host-only' },
    expired: true,
    path: null,
    source: 'keychain' as const,
};

test('an expired host login asks for a refresh, not another sign-in', async () => {
    await expect(
        claudeNativeEnvironment({
            environment: {},
            loadCredentials: async () => expiredHostLogin,
        })
    ).rejects.toThrow('Run `claude` once on this Computer to refresh it');
});

test('both native login failures reach the Computer as authentication issues', async () => {
    const kinds = await Promise.all(
        [null, expiredHostLogin].map(async (loaded) => {
            try {
                await claudeNativeEnvironment({
                    environment: {},
                    loadCredentials: async () => loaded,
                });
            } catch (error) {
                return classifyRuntimeFailure(error);
            }
            return 'no-failure';
        })
    );

    expect(kinds).toEqual(['authentication', 'authentication']);
});

test('missing native login fails with a recovery instruction before Claude starts', async () => {
    await expect(
        claudeNativeEnvironment({ environment: {}, loadCredentials: async () => null })
    ).rejects.toThrow('Sign in to Claude Code on this Computer, then retry the Agent.');
});

test('preserves native API-key authentication without loading an unrelated subscription', async () => {
    expect(
        await claudeNativeEnvironment({
            environment: { ANTHROPIC_API_KEY: 'test-api-key' },
            loadCredentials: () => {
                throw new Error('Must not load OAuth credentials');
            },
        })
    ).toEqual({});
});
