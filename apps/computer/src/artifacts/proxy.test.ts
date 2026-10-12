import { expect, test } from 'bun:test';
import { startLoopbackProxy } from '../proxy.ts';

test('artifact publishing preserves binary bytes through the authenticated Computer proxy', async () => {
    const bytes = Uint8Array.from([0, 255, 128, 195, 40, 10]);
    const received = { bytes: new Uint8Array() };
    let auth = '';
    const upstream = Bun.serve({
        hostname: '127.0.0.1',
        port: 0,
        async fetch(request) {
            auth = request.headers.get('authorization') ?? '';
            received.bytes = new Uint8Array(await request.arrayBuffer());
            return Response.json({ ok: true });
        },
    });
    const proxy = startLoopbackProxy({
        proxyToken: 'local',
        runnerToken: 'runner',
        serverOrigin: `http://127.0.0.1:${upstream.port}`,
    });
    try {
        const response = await fetch(
            `${proxy.url}/api/agent/artifacts/publish-artifact-raw?name=sample`,
            {
                method: 'POST',
                body: bytes,
                headers: {
                    authorization: 'Bearer local',
                    'content-type': 'application/octet-stream',
                },
            }
        );
        expect(response.status).toBe(200);
        expect(received.bytes).toEqual(bytes);
        expect(auth).toBe('Bearer runner');
        proxy.clearRunnerToken();
        expect(
            (
                await fetch(`${proxy.url}/api/agent/artifacts/publish-artifact-raw`, {
                    method: 'POST',
                    body: bytes,
                    headers: { authorization: 'Bearer local' },
                })
            ).status
        ).toBe(409);
    } finally {
        proxy.close();
        upstream.stop(true);
    }
});
