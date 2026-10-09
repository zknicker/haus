import { expect, test } from 'bun:test';
import type { AddressInfo } from 'node:net';
import { createServer, type Server } from 'node:net';
import { startLoopbackProxy } from './proxy.ts';

/** Server answers headers, then drops the socket mid-body. */
async function startTruncatingUpstream(status: number): Promise<{ port: number; server: Server }> {
    const server = createServer((socket) => {
        socket.once('data', () => {
            socket.write(
                `HTTP/1.1 ${status} X\r\ncontent-type: application/json\r\ncontent-length: 100\r\n\r\n{"id"`
            );
            setTimeout(() => socket.destroy(), 10);
        });
    });
    await new Promise<void>((resolve, reject) => {
        server.once('error', reject);
        server.listen(0, '127.0.0.1', resolve);
    });
    return { port: (server.address() as AddressInfo).port, server };
}

for (const [status, counted] of [
    [200, 1],
    [409, 0],
] as const) {
    test(`a send whose HTTP ${status} body is lost counts ${counted}`, async () => {
        const upstream = await startTruncatingUpstream(status);
        const proxy = startLoopbackProxy({
            proxyToken: 'local-token',
            runnerToken: 'runner-token',
            serverOrigin: `http://127.0.0.1:${upstream.port}`,
        });
        try {
            const response = await fetch(`${proxy.url}/api/agent/messages/send`, {
                body: '{}',
                headers: {
                    authorization: 'Bearer local-token',
                    'content-type': 'application/json',
                },
                method: 'POST',
            });
            expect(response.status).toBe(502);
            expect(await response.json()).toMatchObject({ code: 'UPSTREAM_UNAVAILABLE' });
            expect(proxy.sendCount()).toBe(counted);
        } finally {
            proxy.close();
            upstream.server.close();
        }
    });
}
