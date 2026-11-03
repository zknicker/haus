import { afterEach, expect, test } from 'bun:test';
import { startLoopbackProxy } from './proxy.ts';

const servers: Array<{ stop(force?: boolean): void }> = [];

afterEach(() => {
    for (const server of servers.splice(0)) {
        server.stop(true);
    }
});

test('between turns a held request waits for the wake run’s runner instead of failing idle', async () => {
    const seen: string[] = [];
    const upstream = Bun.serve({
        fetch(request) {
            seen.push(request.headers.get('authorization') ?? '');
            return Response.json({ messages: [], more: false });
        },
        hostname: '127.0.0.1',
        port: 0,
    });
    servers.push(upstream);
    const proxy = startLoopbackProxy({
        proxyToken: 'local-token',
        runnerToken: 'runner-one',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        const request = () =>
            fetch(`${proxy.url}/api/agent/inbox`, {
                headers: { authorization: 'Bearer local-token' },
            });
        proxy.clearRunnerToken();
        // A turn Claude Code started on its own calls `haus` before its wake run arrives.
        proxy.holdForRunner(5000);
        const held = request();
        await Bun.sleep(30);
        proxy.setRunnerToken('runner-wake');
        expect((await held).status).toBe(200);
        expect(seen).toEqual(['Bearer runner-wake']);

        // A hold that runs out lets the request reach the idle refusal.
        proxy.clearRunnerToken();
        proxy.holdForRunner(20);
        expect((await request()).status).toBe(409);
    } finally {
        proxy.close();
    }
});
