import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerWebSocket } from 'bun';
import { getFreePort } from './test-port.ts';

const entrypoint = fileURLToPath(new URL('./index.ts', import.meta.url));

interface StoredSession {
    accessToken: string;
    accessTokenExpiresAt: string;
    origin: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
    sessionId: string;
}
const session: StoredSession = {
    accessToken: `gcl_at_${'a'.repeat(43)}`,
    accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
    origin: '',
    refreshToken: `gcl_rt_${'b'.repeat(43)}`,
    refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
    sessionId: 'cls_1234567890123456',
};

test('setup does not probe the superseded one-off approval protocol', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-setup-no-legacy-'));
    const requests: string[] = [];
    const peer = Bun.serve({
        fetch(request) {
            requests.push(new URL(request.url).pathname);
            return Response.json({ error: 'missing' }, { status: 404 });
        },
        hostname: '127.0.0.1',
        port: await getFreePort(),
    });

    try {
        const result = await runCli(['setup', '/hq'], {
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_SERVER_ORIGIN: `http://127.0.0.1:${peer.port}`,
        });

        expect(result.exitCode).toBe(1);
        expect(requests).toEqual(['/computer/login']);
    } finally {
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('setup resumes an existing attachment without login or migration', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-setup-existing-'));
    const requests: string[] = [];
    const sockets = new Set<ServerWebSocket<undefined>>();
    const peer = Bun.serve({
        fetch(request, server) {
            const url = new URL(request.url);
            if (url.pathname === '/computer/attachment' && server.upgrade(request)) {
                return;
            }
            requests.push(url.pathname);
            if (url.pathname === '/computer/validate') {
                return Response.json({ id: 'cmp_existing123456' });
            }
            return new Response('missing', { status: 404 });
        },
        hostname: '127.0.0.1',
        port: await getFreePort(),
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
    try {
        const attachmentRoot = join(dataRoot, 'servers', 'srv_existing_server');
        await mkdir(attachmentRoot, { mode: 0o700, recursive: true });
        await writeFile(
            join(attachmentRoot, 'attachment.json'),
            `${JSON.stringify({
                computerId: 'cmp_existing123456',
                credential: 'existing-credential',
                serverId: 'srv_existing_server',
                serverOrigin: origin,
                slug: 'hq',
            })}\n`,
            { mode: 0o600 }
        );
        const pendingRoot = join(dataRoot, 'pending-attachments');
        await mkdir(pendingRoot, { mode: 0o700, recursive: true });
        await writeFile(
            join(pendingRoot, 'hq.json'),
            `${JSON.stringify({
                credential: 'p'.repeat(43),
                idempotencyKey: `cak_${'i'.repeat(43)}`,
                origin,
                slug: 'hq',
            })}\n`,
            { mode: 0o600 }
        );
        const result = await runCli(['setup', '/hq'], {
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_ONESHOT: '1',
            HAUS_COMPUTER_USAGE_DISABLED: '1',
            HAUS_SERVER_ORIGIN: origin,
            OTEL_SDK_DISABLED: 'true',
        });

        expect(result.exitCode, result.stderr).toBe(0);
        expect(requests.length).toBeGreaterThan(0);
        expect(requests.every((path) => path === '/computer/validate')).toBe(true);
        await expect(readFile(join(attachmentRoot, 'attachment.json'), 'utf8')).resolves.toContain(
            'existing-credential'
        );
        await expect(stat(join(pendingRoot, 'hq.json'))).rejects.toThrow();
    } finally {
        for (const socket of sockets) {
            socket.close();
        }
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('setup adds another Server without replacing the first attachment', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-setup-additive-'));
    const sockets = new Set<ServerWebSocket<undefined>>();
    const attached = new Map([
        ['hq', { computerId: 'cmp_first123456789', serverId: 'srv_first123456789' }],
        ['lab', { computerId: 'cmp_second12345678', serverId: 'srv_second1234567' }],
    ]);
    const peer = Bun.serve({
        async fetch(request, server) {
            const url = new URL(request.url);
            if (url.pathname === '/computer/attachment' && server.upgrade(request)) {
                return;
            }
            if (url.pathname === '/computer/login/complete') {
                return Response.json({ status: 'completed' });
            }
            if (url.pathname === '/computer/attach') {
                const body = (await request.json()) as { slug: string };
                const result = attached.get(body.slug);
                return Response.json({
                    computerId: result?.computerId,
                    idempotent: false,
                    serverId: result?.serverId,
                    slug: body.slug,
                });
            }
            return new Response('missing', { status: 404 });
        },
        hostname: '127.0.0.1',
        port: await getFreePort(),
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
    try {
        await writeSession(dataRoot, { ...session, origin });
        for (const slug of ['hq', 'lab']) {
            const result = await runCli(['setup', `/${slug}`], {
                HAUS_COMPUTER_DATA_ROOT: dataRoot,
                HAUS_COMPUTER_ONESHOT: '1',
                HAUS_COMPUTER_USAGE_DISABLED: '1',
                HAUS_SERVER_ORIGIN: origin,
            });
            expect(result.exitCode, result.stderr).toBe(0);
        }

        await expect(
            stat(join(dataRoot, 'servers', 'srv_first123456789', 'attachment.json'))
        ).resolves.toBeTruthy();
        await expect(
            stat(join(dataRoot, 'servers', 'srv_second1234567', 'attachment.json'))
        ).resolves.toBeTruthy();
        await expect(
            stat(join(dataRoot, 'servers', 'srv_first123456789', 'attachment.json'))
        ).resolves.toBeTruthy();
    } finally {
        for (const socket of sockets) {
            socket.close();
        }
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('setup retries a durable login acknowledgement after attachment persistence', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-setup-ack-retry-'));
    const sockets = new Set<ServerWebSocket<undefined>>();
    let completionAttempts = 0;
    let origin = '';
    const refreshedSession: StoredSession = {
        accessToken: `gcl_at_${'c'.repeat(43)}`,
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        origin: '',
        refreshToken: `gcl_rt_${'d'.repeat(43)}`,
        refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        sessionId: session.sessionId,
    };
    const peer = Bun.serve({
        async fetch(request, server) {
            const url = new URL(request.url);
            if (url.pathname === '/computer/attachment' && server.upgrade(request)) {
                return;
            }
            if (url.pathname === '/computer/login/complete') {
                completionAttempts += 1;
                const body = (await request.json()) as { accessToken: string };
                await expect(
                    stat(join(dataRoot, 'servers', 'srv_ack_server', 'attachment.json'))
                ).resolves.toBeTruthy();
                if (completionAttempts === 1) {
                    expect(body.accessToken).toBe(session.accessToken);
                    return Response.json({ error: 'temporary failure' }, { status: 503 });
                }
                if (body.accessToken !== refreshedSession.accessToken) {
                    return Response.json({ error: 'expired access token' }, { status: 401 });
                }
                return Response.json({ status: 'completed' });
            }
            if (url.pathname === '/computer/login/refresh') {
                return Response.json({
                    ...refreshedSession,
                    origin,
                    status: 'refreshed',
                });
            }
            if (url.pathname === '/computer/validate') {
                return Response.json({ id: 'cmp_ack1234567890' });
            }
            if (url.pathname === '/computer/attach') {
                return Response.json({
                    computerId: 'cmp_ack1234567890',
                    idempotent: false,
                    serverId: 'srv_ack_server',
                    slug: 'hq',
                });
            }
            return new Response('missing', { status: 404 });
        },
        hostname: '127.0.0.1',
        port: await getFreePort(),
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
    origin = `http://127.0.0.1:${peer.port}`;
    try {
        await writeSession(dataRoot, { ...session, origin });
        const first = await runCli(['setup', '/hq'], {
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_ONESHOT: '1',
            HAUS_COMPUTER_USAGE_DISABLED: '1',
            HAUS_SERVER_ORIGIN: origin,
        });
        expect(first.exitCode).toBe(1);
        await expect(
            stat(join(dataRoot, 'servers', 'srv_ack_server', 'attachment.json'))
        ).resolves.toBeTruthy();
        await expect(stat(join(dataRoot, 'pending-attachments', 'hq.json'))).resolves.toBeTruthy();
        await writeSession(dataRoot, {
            ...session,
            accessTokenExpiresAt: new Date(Date.now() - 1000).toISOString(),
            origin,
        });

        const retry = await runCli(['setup', '/hq'], {
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_ONESHOT: '1',
            HAUS_COMPUTER_USAGE_DISABLED: '1',
            HAUS_SERVER_ORIGIN: origin,
        });
        expect(retry.exitCode, retry.stderr).toBe(0);
        expect(completionAttempts).toBe(2);
        await expect(stat(join(dataRoot, 'pending-attachments', 'hq.json'))).rejects.toThrow();
    } finally {
        for (const socket of sockets) {
            socket.close();
        }
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

async function writeSession(dataRoot: string, value: StoredSession) {
    await mkdir(dataRoot, { mode: 0o700, recursive: true });
    await writeFile(join(dataRoot, 'login.json'), `${JSON.stringify(value)}\n`, { mode: 0o600 });
}

async function runCli(args: string[], environment: Record<string, string | undefined>) {
    const child = Bun.spawn(['bun', entrypoint, ...args], {
        env: { ...process.env, ...environment },
        stderr: 'pipe',
        stdout: 'pipe',
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        child.exited,
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
    ]);
    return { exitCode, stderr, stdout };
}
