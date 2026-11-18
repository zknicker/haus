import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ServerWebSocket } from 'bun';

const entrypoint = fileURLToPath(new URL('./index.ts', import.meta.url));

interface StoredSession {
    accessToken: string;
    accessTokenExpiresAt: string;
    origin: string;
    refreshToken: string;
    refreshTokenExpiresAt: string;
    sessionId: string;
}
function createSession(origin: string): StoredSession {
    return {
        accessToken: `gcl_at_${'a'.repeat(43)}`,
        accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        origin,
        refreshToken: `gcl_rt_${'b'.repeat(43)}`,
        refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
        sessionId: 'cls_1234567890123456',
    };
}

test('attach requires an existing usable Computer login and never launches login', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-attach-login-'));
    const requests: string[] = [];
    const peer = Bun.serve({
        fetch(request) {
            requests.push(new URL(request.url).pathname);
            return new Response('login must be supplied first', { status: 500 });
        },
        port: 0,
    });
    try {
        const result = await runCli(['attach', '/hq'], {
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_SERVER_ORIGIN: `http://127.0.0.1:${peer.port}`,
        });

        expect(result.exitCode).not.toBe(0);
        expect(result.stderr).toContain('Haus Computer is not signed in');
        expect(result.stderr).toContain('haus-computer login');
        expect(requests).toEqual([]);
    } finally {
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('attach uses the saved login and stores only the Server-scoped credential', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-attach-'));
    const requests: { body?: Record<string, string>; path: string }[] = [];
    const sockets = new Set<ServerWebSocket<undefined>>();
    const peer = Bun.serve({
        async fetch(request, server) {
            const url = new URL(request.url);
            if (url.pathname === '/computer/attachment' && server.upgrade(request)) {
                return;
            }
            requests.push({
                body:
                    request.method === 'POST'
                        ? ((await request.json()) as Record<string, string>)
                        : undefined,
                path: url.pathname,
            });
            if (url.pathname === '/computer/attach') {
                const body = requests.at(-1)?.body;
                return Response.json({
                    computerId: 'cmp_1234567890123456',
                    idempotent: false,
                    serverId: 'srv_attach_server',
                    slug: body?.slug,
                });
            }
            return new Response('missing', { status: 404 });
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
    const session = createSession(origin);
    try {
        await writeSession(dataRoot, session);
        const result = await runCli(['attach', '/hq'], {
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_ONESHOT: '1',
            HAUS_COMPUTER_USAGE_DISABLED: '1',
            HAUS_SERVER_ORIGIN: origin,
            OTEL_SDK_DISABLED: 'true',
        });

        expect(result.exitCode, result.stderr).toBe(0);
        const attachRequest = requests.find((request) => request.path === '/computer/attach');
        expect(attachRequest?.body).toMatchObject({
            accessToken: session.accessToken,
            slug: 'hq',
        });
        expect(attachRequest?.body?.credentialHash).toMatch(/^[a-f0-9]{64}$/u);
        expect(attachRequest?.body?.idempotencyKey).toMatch(/^cak_[A-Za-z0-9_-]{43}$/u);
        expect(
            requests.map((request) => request.path).filter((path) => path !== '/computer/validate')
        ).toEqual(['/computer/attach']);

        const attachment = JSON.parse(
            await readFile(
                join(dataRoot, 'servers', 'srv_attach_server', 'attachment.json'),
                'utf8'
            )
        ) as Record<string, string>;
        expect(attachment).toMatchObject({
            computerId: 'cmp_1234567890123456',
            serverId: 'srv_attach_server',
            serverOrigin: origin,
            slug: 'hq',
        });
        expect(attachment.credential).toHaveLength(43);
        expect(attachment.credential).not.toBe(session.accessToken);
        expect(attachment).not.toHaveProperty('accessToken');
        expect(
            (await stat(join(dataRoot, 'servers', 'srv_attach_server', 'attachment.json'))).mode &
                0o777
        ).toBe(0o600);
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
