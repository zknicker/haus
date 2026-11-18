import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerWebSocket } from 'bun';

const entrypoint = fileURLToPath(new URL('./index.ts', import.meta.url));

test('the attachment daemon itself reconnects with backoff across Server restarts', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-test-'));
    const connected = Promise.withResolvers<void>();
    const reconnected = Promise.withResolvers<void>();
    const sockets = new Set<ServerWebSocket<undefined>>();
    let connections = 0;
    let failedValidations = 0;
    const peer = Bun.serve({
        fetch(request, server) {
            const pathname = new URL(request.url).pathname;
            if (pathname === '/computer/validate') {
                // The first validation after the dropped socket fails, like a
                // Server that is still restarting; the daemon must retry it.
                if (connections === 1 && failedValidations === 0) {
                    failedValidations += 1;
                    return new Response('restarting', { status: 500 });
                }
                return Response.json({ valid: true });
            }
            if (pathname === '/computer/attachment' && server.upgrade(request)) {
                return;
            }
            return new Response('missing', { status: 404 });
        },
        port: 0,
        websocket: {
            message(socket, message) {
                sockets.add(socket);
                const frame = JSON.parse(String(message)) as { type?: string };
                if (frame.type !== 'bootstrap') {
                    return;
                }
                connections += 1;
                socket.send(JSON.stringify({ mode: 'ordinary', type: 'bootstrap-accepted' }));
                if (connections === 1) {
                    connected.resolve();
                    setTimeout(() => socket.terminate(), 10);
                } else {
                    reconnected.resolve();
                }
            },
        },
    });
    const serverId = 'srv_test';
    const attachmentRoot = join(dataRoot, 'servers', serverId);
    await mkdir(attachmentRoot, { recursive: true });
    await writeFile(
        join(attachmentRoot, 'attachment.json'),
        JSON.stringify({
            computerId: 'cmp_1234567890123456',
            credential: 'credential',
            serverId,
            serverOrigin: `http://127.0.0.1:${peer.port}`,
            slug: 'hq',
        })
    );
    const child = Bun.spawn(['bun', entrypoint, '__attachment-daemon', serverId], {
        env: {
            ...process.env,
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_USAGE_DISABLED: '1',
            NODE_ENV: 'test',
        },
        stderr: 'pipe',
        stdout: 'pipe',
    });
    try {
        const exited = child.exited.then(async (code) => {
            throw new Error(
                `The attachment daemon exited ${code}: ${await new Response(child.stderr).text()}`
            );
        });
        await Promise.race([connected.promise, exited, deadline('start')]);
        await Promise.race([reconnected.promise, exited, deadline('reconnect')]);
        expect(connections).toBe(2);
        expect(failedValidations).toBe(1);
        expect(child.exitCode).toBeNull();
    } finally {
        for (const socket of sockets) {
            socket.close();
        }
        child.kill();
        await child.exited;
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
}, 14_000);

function deadline(phase: 'start' | 'reconnect') {
    return Bun.sleep(6000).then(() => {
        throw new Error(`The attachment daemon did not ${phase} within six seconds.`);
    });
}
