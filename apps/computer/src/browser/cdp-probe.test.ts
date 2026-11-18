import { expect, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SystemCdpProber } from './cdp-probe.ts';

test('validates the browser target identity and follows a changed debugging port after recovery', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'haus-cdp-'));
    const server = Bun.serve({
        port: 0,
        hostname: '127.0.0.1',
        fetch: (): Response =>
            Response.json({
                Browser: 'Chrome/153',
                webSocketDebuggerUrl: `ws://127.0.0.1:${server.port}/devtools/browser/current`,
            }),
    });
    const port = server.port;
    if (!port) {
        throw new Error('Test server has no port');
    }
    const probe = new SystemCdpProber();
    try {
        await writeFile(
            join(directory, 'DevToolsActivePort'),
            `${server.port}\n/devtools/browser/stale\n`
        );
        expect((await probe.probe(directory)).state).toBe('unreachable');
        await writeFile(
            join(directory, 'DevToolsActivePort'),
            `${server.port}\n/devtools/browser/current\n`
        );
        expect((await probe.probe(directory)).state).toBe('healthy');
        expect((await probe.attachment(directory)).port).toBe(port);
        await writeFile(
            join(directory, 'DevToolsActivePort'),
            '99999\n/devtools/browser/current\n'
        );
        expect((await probe.probe(directory)).state).toBe('unreachable');
    } finally {
        server.stop(true);
        await rm(directory, { recursive: true, force: true });
    }
});
