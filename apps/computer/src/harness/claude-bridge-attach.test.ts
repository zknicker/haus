import { expect, test } from 'bun:test';
import { createServer } from 'node:net';
import { createClaudeCode } from '@ai-sdk/harness-claude-code';

// Juniper, 2026-09-30: a Computer restart killed her bridge before its coordinates were cleared.
// Reattaching to the dead port retried for the whole 120s startup budget, so every resume timed
// out before the adapter reached its spawn fallback. The patched attach gives up within 10s.
test('a resume whose stored bridge is gone reaches the spawn fallback quickly', async () => {
    const deadPort = await closedPort();
    const startedAt = Date.now();
    let spawnedAfterMs: number | null = null;
    const sandboxSession = {
        getPortEndpoint: ({ port }: { port: number }) => ({ url: `ws://127.0.0.1:${port}` }),
        ports: [deadPort],
        readTextFile: () => Promise.reject(new Error('missing')),
        run: () => Promise.resolve({ exitCode: 0, stderr: '', stdout: '/tmp/haus-attach-home' }),
        spawn: () => {
            spawnedAfterMs = Date.now() - startedAt;
            return Promise.reject(new Error('spawn fallback reached'));
        },
        writeTextFile: () => Promise.resolve(),
    };

    const start = createClaudeCode({ auth: { apiKey: 'test-key' } }).doStart({
        resumeFrom: {
            data: {
                bridge: {
                    lastSeenEventId: 7202,
                    port: deadPort,
                    sandboxId: 'stale',
                    token: 'stale',
                },
                claudeSessionId: 'f25970f3-5ece-4a0b-89c8-e9b80d57a5e5',
            },
            harnessId: 'claude-code',
            specificationVersion: 'harness-v1',
            type: 'resume-session',
        },
        sandboxSession,
        sessionId: 'agt_test-5',
        sessionWorkDir: '/tmp/haus-attach-work',
    } as unknown as Parameters<ReturnType<typeof createClaudeCode>['doStart']>[0]);

    await expect(start).rejects.toThrow('spawn fallback reached');
    expect(spawnedAfterMs).not.toBeNull();
    expect(spawnedAfterMs ?? Number.POSITIVE_INFINITY).toBeLessThan(15_000);
}, 30_000);

/** A loopback port that was just released, so connecting to it is refused. */
async function closedPort(): Promise<number> {
    const server = createServer();
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    if (!address || typeof address === 'string') {
        throw new Error('Expected a TCP address');
    }
    return address.port;
}
