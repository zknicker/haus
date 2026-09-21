import { afterAll, expect, spyOn, test } from 'bun:test';
import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { HarnessV1RequestTransformation } from '@ai-sdk/harness';
import { makeDaemonRuntime } from '../daemon-runtime.ts';
import { createHarnessForRuntime } from './runtime-harness.ts';
import { createLocalTrustedSandboxProvider } from './sandbox.ts';

const runtime = makeDaemonRuntime();
afterAll(() => runtime.dispose());

test('Claude forwards an explicit host API key through the SDK', async () => {
    const previous = process.env.ANTHROPIC_API_KEY;
    process.env.ANTHROPIC_API_KEY = 'haus-test-api-key';
    try {
        const transformations = await captureAuthentication('claude-code');
        expect(JSON.stringify(transformations)).toContain('haus-test-api-key');
    } finally {
        if (previous === undefined) {
            Reflect.deleteProperty(process.env, 'ANTHROPIC_API_KEY');
        } else {
            process.env.ANTHROPIC_API_KEY = previous;
        }
    }
});

for (const runtimeId of ['claude-code', 'grok-build']) {
    test(`${runtimeId} refreshes its host subscription and persists the rotated token`, async () => {
        const root = await mkdtemp(join(tmpdir(), 'haus-host-auth-'));
        const isClaude = runtimeId === 'claude-code';
        const scope = 'https://auth.test::b1a00492-073a-47ea-816f-4c329264a828';
        const credentialPath = join(root, isClaude ? '.credentials.json' : 'auth.json');
        await writeFile(
            credentialPath,
            JSON.stringify(
                isClaude
                    ? {
                          claudeAiOauth: {
                              accessToken: 'old-token',
                              refreshToken: 'old-refresh',
                              expiresAt: 1,
                          },
                      }
                    : {
                          [scope]: {
                              key: 'old-token',
                              refresh_token: 'old-refresh',
                              expires_at: 1,
                          },
                      }
            )
        );
        const environment = {
            ANTHROPIC_API_KEY: undefined,
            ANTHROPIC_AUTH_TOKEN: undefined,
            CLAUDE_CODE_OAUTH_TOKEN: undefined,
            AI_GATEWAY_API_KEY: undefined,
            VERCEL_OIDC_TOKEN: undefined,
            XAI_API_KEY: undefined,
            CLAUDE_CONFIG_DIR: root,
            GROK_HOME: root,
        };
        const previous = new Map(Object.keys(environment).map((key) => [key, process.env[key]]));
        for (const [key, value] of Object.entries(environment)) {
            if (value === undefined) {
                delete process.env[key];
            } else {
                process.env[key] = value;
            }
        }
        let refreshCount = 0;
        const fetchMock = spyOn(globalThis, 'fetch').mockImplementation(
            Object.assign(
                async (url: string | URL | Request, options?: RequestInit) => {
                    if (String(url) === 'https://auth.test/.well-known/openid-configuration') {
                        return Response.json({ token_endpoint: 'https://auth.test/token' });
                    }
                    expect(String(url)).toBe(
                        isClaude
                            ? 'https://platform.claude.com/v1/oauth/token'
                            : 'https://auth.test/token'
                    );
                    expect(String(options?.body)).toContain('old-refresh');
                    refreshCount += 1;
                    return Response.json({
                        access_token: 'new-token',
                        refresh_token: 'new-refresh',
                        expires_in: 3600,
                    });
                },
                { preconnect: globalThis.fetch.preconnect }
            )
        );
        try {
            expect(JSON.stringify(await captureAuthentication(runtimeId))).toContain('new-token');
            expect(await readFile(credentialPath, 'utf8')).toContain('new-refresh');
            expect(JSON.stringify(await captureAuthentication(runtimeId))).toContain('new-token');
            expect(refreshCount).toBe(1);
        } finally {
            fetchMock.mockRestore();
            for (const [key, value] of previous) {
                if (value === undefined) {
                    delete process.env[key];
                } else {
                    process.env[key] = value;
                }
            }
            await rm(root, { recursive: true, force: true });
        }
    });
}

async function captureAuthentication(runtimeId: string) {
    const root = await realpath(await mkdtemp(join(tmpdir(), 'haus-native-auth-')));
    const provider = createLocalTrustedSandboxProvider({ rootDir: root, runtime });
    const sandbox = await provider.createSession();
    const captured: HarnessV1RequestTransformation[] = [];
    const stop = new Error('Authentication captured before runtime launch');
    try {
        await expect(
            Promise.resolve(
                createHarnessForRuntime(runtimeId, 'medium').doStart({
                    sessionId: 'authentication-test',
                    sessionWorkDir: join(root, 'workspace'),
                    sandboxSession: {
                        ...sandbox,
                        spawn: () => {
                            throw stop;
                        },
                        addRequestTransformations: (transformations) => {
                            captured.push(...transformations);
                            throw stop;
                        },
                        restricted: () => ({
                            ...sandbox.restricted(),
                            spawn: () => {
                                throw stop;
                            },
                        }),
                    },
                })
            )
        ).rejects.toBe(stop);
        return captured;
    } finally {
        await sandbox.destroy();
        await rm(root, { recursive: true, force: true });
    }
}
