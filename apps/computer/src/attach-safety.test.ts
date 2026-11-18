import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerWebSocket } from 'bun';

const entrypoint = fileURLToPath(new URL('./index.ts', import.meta.url));

test('attach rejects redirects without forwarding the management token', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-attach-redirect-'));
    const receivedBodies: unknown[] = [];
    const receiver = Bun.serve({
        async fetch(request) {
            receivedBodies.push(await request.json());
            return Response.json({ error: 'captured' }, { status: 500 });
        },
        port: 0,
    });
    const redirector = Bun.serve({
        fetch(request) {
            if (new URL(request.url).pathname === '/computer/attach') {
                return Response.redirect(`http://127.0.0.1:${receiver.port}/capture`, 307);
            }
            return new Response('missing', { status: 404 });
        },
        port: 0,
    });
    const origin = `http://127.0.0.1:${redirector.port}`;
    try {
        await writeSession(dataRoot, origin);
        const result = await runCli(['attach', '/hq'], dataRoot, origin);

        expect(result.exitCode).not.toBe(0);
        expect(receivedBodies).toEqual([]);
    } finally {
        redirector.stop(true);
        receiver.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('setup preserves a missing-Server attach error without trying another protocol', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-attach-missing-'));
    const requests: string[] = [];
    const peer = Bun.serve({
        fetch(request) {
            const path = new URL(request.url).pathname;
            requests.push(path);
            if (path === '/computer/attach') {
                return Response.json(
                    {
                        code: 'computer_attachment_server_not_found',
                        error: 'No Haus server exists at /missing-server.',
                    },
                    { status: 404 }
                );
            }
            return Response.json({ error: 'no other request should run' }, { status: 500 });
        },
        port: 0,
    });
    const origin = `http://127.0.0.1:${peer.port}`;
    try {
        await writeSession(dataRoot, origin);
        const result = await runCli(['setup', '/missing-server'], dataRoot, origin);

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('No Haus server exists at /missing-server.');
        expect(requests).toEqual(['/computer/attach']);
    } finally {
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('attach adopts an existing attachment instead of issuing a duplicate Computer', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-attach-existing-'));
    const requests: string[] = [];
    const sockets = new Set<ServerWebSocket<undefined>>();
    const peer = Bun.serve({
        fetch(request, server) {
            const path = new URL(request.url).pathname;
            if (path === '/computer/attachment' && server.upgrade(request)) {
                return;
            }
            requests.push(path);
            if (path === '/computer/validate') {
                return Response.json({ id: 'cmp_existing_attach' });
            }
            return Response.json({ error: 'duplicate issuance' }, { status: 500 });
        },
        port: 0,
        websocket: {
            message(socket, message) {
                sockets.add(socket);
                const frame = JSON.parse(String(message)) as { type?: string };
                if (frame.type === 'bootstrap') {
                    socket.send(JSON.stringify({ mode: 'ordinary', type: 'bootstrap-accepted' }));
                }
            },
        },
    });
    const origin = `http://127.0.0.1:${peer.port}`;
    const attachmentPath = join(dataRoot, 'servers', 'srv_existing_attach', 'attachment.json');
    try {
        await writeSession(dataRoot, origin);
        await mkdir(join(dataRoot, 'servers', 'srv_existing_attach'), {
            mode: 0o700,
            recursive: true,
        });
        await writeFile(
            attachmentPath,
            `${JSON.stringify({
                computerId: 'cmp_existing_attach',
                credential: 'existing-attachment-credential',
                serverId: 'srv_existing_attach',
                serverOrigin: origin,
                slug: 'hq',
            })}\n`,
            { mode: 0o600 }
        );

        const result = await runCli(['attach', '/hq'], dataRoot, origin);

        expect(result.exitCode, result.stderr).toBe(0);
        expect(requests.length).toBeGreaterThan(0);
        expect(requests.every((path) => path === '/computer/validate')).toBe(true);
        await expect(readFile(attachmentPath, 'utf8')).resolves.toContain(
            'existing-attachment-credential'
        );
    } finally {
        for (const socket of sockets) {
            socket.close();
        }
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

async function writeSession(dataRoot: string, origin: string) {
    await mkdir(dataRoot, { mode: 0o700, recursive: true });
    await writeFile(
        join(dataRoot, 'login.json'),
        `${JSON.stringify({
            accessToken: `gcl_at_${'a'.repeat(43)}`,
            accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
            origin,
            refreshToken: `gcl_rt_${'b'.repeat(43)}`,
            refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
            sessionId: 'cls_1234567890123456',
        })}\n`,
        { mode: 0o600 }
    );
}

async function runCli(args: string[], dataRoot: string, origin: string) {
    const child = Bun.spawn(['bun', entrypoint, ...args], {
        env: {
            ...process.env,
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_ONESHOT: '1',
            HAUS_COMPUTER_USAGE_DISABLED: '1',
            HAUS_SERVER_ORIGIN: origin,
            OTEL_SDK_DISABLED: 'true',
        },
        stderr: 'pipe',
        stdout: 'pipe',
    });
    const [exitCode, stderr] = await Promise.all([child.exited, new Response(child.stderr).text()]);
    return { exitCode, stderr };
}
