import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computerProtocolVersion } from '@haus/api';
import type { ServerWebSocket } from 'bun';
import { computerVersion } from './build-identity.ts';
import { launchdPlist, recoverInterruptedUpdate } from './index.ts';
import { progress, readUpdateProgress, writeUpdateProgress } from './update.ts';

const entrypoint = fileURLToPath(new URL('./index.ts', import.meta.url));

test('setup signs in, stores only a Server credential, and reruns by validation', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-test-'));
    const browserBin = join(dataRoot, 'browser-bin');
    const browserMarker = join(dataRoot, 'browser-opened.txt');
    await mkdir(browserBin, { recursive: true });
    await writeFile(
        join(browserBin, 'open'),
        '#!/bin/sh\nprintf \'%s\' "$1" > "$HAUS_BROWSER_OPEN_MARKER"\n',
        { mode: 0o755 }
    );
    const effectiveAgentRoot = join(dataRoot, 'servers', 'srv_test', 'agents', 'agt_effective');
    await mkdir(effectiveAgentRoot, { recursive: true });
    await writeFile(
        join(effectiveAgentRoot, 'session.json'),
        JSON.stringify({
            effectiveModel: { modelId: 'gpt-5.6-sol', runtimeId: 'codex' },
            generation: 1,
            resumeState: null,
            runtimeSessionId: 'runtime-session',
        })
    );
    const requests: string[] = [];
    const socketFrames: unknown[] = [];
    const peer = Bun.serve({
        async fetch(request, server) {
            const url = new URL(request.url);
            requests.push(`${request.method} ${url.pathname}`);
            if (url.pathname === '/computer/attachment') {
                if (server.upgrade(request)) {
                    return;
                }
                return new Response('upgrade failed', { status: 500 });
            }
            if (url.pathname === '/computer/login' && request.method === 'POST') {
                return Response.json({
                    deviceCode: 'd'.repeat(43),
                    expiresAt: new Date(Date.now() + 60_000).toISOString(),
                    pollingIntervalMs: 1,
                    userCode: 'ABCD-EFGH',
                    verificationUrl: `${url.origin}/computer/login?code=ABCD-EFGH`,
                });
            }
            if (url.pathname === '/computer/login/poll') {
                return Response.json({
                    accessToken: `gcl_at_${'a'.repeat(43)}`,
                    accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
                    origin: url.origin,
                    refreshToken: `gcl_rt_${'b'.repeat(43)}`,
                    refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
                    sessionId: 'cls_1234567890123456',
                    status: 'approved',
                });
            }
            if (url.pathname === '/computer/attach') {
                return Response.json({
                    computerId: 'cmp_1234567890123456',
                    idempotent: false,
                    serverId: 'srv_test',
                    slug: 'hq',
                });
            }
            if (url.pathname === '/computer/login/complete') {
                return Response.json({ status: 'completed' });
            }
            if (url.pathname === '/computer/validate') {
                return Response.json({ id: 'cmp_1234567890123456' });
            }
            return new Response('missing', { status: 404 });
        },
        port: 0,
        websocket: {
            message(socket, message) {
                const frame = JSON.parse(String(message)) as { type?: string };
                socketFrames.push(frame);
                if (frame.type === 'bootstrap') {
                    socket.send(JSON.stringify({ mode: 'ordinary', type: 'bootstrap-accepted' }));
                }
            },
        },
    });
    try {
        const environment = {
            ...process.env,
            HAUS_BROWSER_OPEN_MARKER: browserMarker,
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_ONESHOT: '1',
            HAUS_COMPUTER_USAGE_DISABLED: '1',
            HAUS_SERVER_ORIGIN: `http://127.0.0.1:${peer.port}`,
            PATH: `${browserBin}:${process.env.PATH ?? ''}`,
        };
        await runCli(environment);
        expect(await waitForFile(browserMarker)).toBe(
            `http://127.0.0.1:${peer.port}/computer/login?code=ABCD-EFGH`
        );
        const attachmentRoot = join(dataRoot, 'servers', 'srv_test');
        const attachmentPath = join(dataRoot, 'servers', 'srv_test', 'attachment.json');
        const attachment = JSON.parse(await readFile(attachmentPath, 'utf8')) as Record<
            string,
            string
        >;
        expect(attachment).toMatchObject({
            computerId: 'cmp_1234567890123456',
            serverOrigin: `http://127.0.0.1:${peer.port}`,
            serverId: 'srv_test',
            slug: 'hq',
        });
        expect(attachment.credential).toHaveLength(43);
        expect((await stat(attachmentPath)).mode & 0o777).toBe(0o600);
        expect(socketFrames[0]).toMatchObject({
            bootstrapProtocolVersion: 1,
            productVersion: computerVersion,
            protocolVersion: computerProtocolVersion,
            type: 'bootstrap',
            update: { phase: 'idle' },
        });
        expect(socketFrames[0]).not.toHaveProperty('name');
        const reportFrame = socketFrames.find(
            (frame) =>
                typeof frame === 'object' &&
                frame !== null &&
                'type' in frame &&
                frame.type === 'report'
        );
        expect(reportFrame).toMatchObject({
            agents: [
                {
                    agentId: 'agt_effective',
                    missingResources: [],
                    modelId: 'gpt-5.6-sol',
                    runtimeId: 'codex',
                },
            ],
            inventory: { name: expect.any(String) },
            type: 'report',
        });
        const hausAgentReportFrame = socketFrames.find(
            (frame) =>
                typeof frame === 'object' &&
                frame !== null &&
                'type' in frame &&
                frame.type === 'haus-agent-report'
        );
        expect(hausAgentReportFrame).toMatchObject({
            agents: [
                {
                    agentId: 'agt_effective',
                    appliedAt: null,
                    status: 'pending',
                    version: null,
                },
            ],
            type: 'haus-agent-report',
        });

        await writeFile(
            join(attachmentRoot, 'terminal-unlinked.json'),
            JSON.stringify({
                computerId: attachment.computerId,
                reason: 'computer_machine_unlinked',
            })
        );
        await runCli(environment);
        expect(
            await stat(join(attachmentRoot, 'terminal-unlinked.json')).catch(() => null)
        ).toBeNull();
        expect(requests).not.toContain('POST /computer/setup');
        expect(requests.filter((request) => request === 'POST /computer/attach')).toHaveLength(1);
        expect(requests.filter((request) => request === 'POST /computer/validate')).toHaveLength(3);
    } finally {
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
}, 15_000);

test('login exchanges a device grant and atomically stores an origin-bound session', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-login-test-'));
    const requests: string[] = [];
    let polls = 0;
    const peer = Bun.serve({
        async fetch(request) {
            const url = new URL(request.url);
            requests.push(`${request.method} ${url.pathname}`);
            if (url.pathname === '/computer/login' && request.method === 'POST') {
                expect(await request.json()).toEqual({ origin: url.origin });
                return Response.json({
                    deviceCode: 'd'.repeat(43),
                    expiresAt: new Date(Date.now() + 60_000).toISOString(),
                    pollingIntervalMs: 1,
                    userCode: 'ABCD-EFGH',
                    verificationUrl: `${url.origin}/computer/login?code=ABCD-EFGH`,
                });
            }
            if (url.pathname === '/computer/login/poll' && request.method === 'POST') {
                polls += 1;
                if (polls === 1) {
                    return Response.json({ pollingIntervalMs: 1, status: 'pending' });
                }
                return Response.json({
                    accessToken: 'gcl_at_access-token',
                    accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
                    origin: url.origin,
                    refreshToken: 'gcl_rt_refresh-token',
                    refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
                    sessionId: 'cls_1234567890123456',
                    status: 'approved',
                });
            }
            if (url.pathname === '/computer/login/complete' && request.method === 'POST') {
                const session = JSON.parse(
                    await readFile(join(dataRoot, 'login.json'), 'utf8')
                ) as Record<string, string>;
                expect(session.accessToken).toBe('gcl_at_access-token');
                expect(await request.json()).toEqual({ accessToken: 'gcl_at_access-token' });
                return Response.json({ status: 'completed' });
            }
            return new Response('missing', { status: 404 });
        },
        port: 0,
    });
    try {
        const child = Bun.spawn(['bun', entrypoint, 'login'], {
            env: {
                ...process.env,
                HAUS_COMPUTER_DATA_ROOT: dataRoot,
                HAUS_COMPUTER_DISABLE_BROWSER_OPEN: '1',
                HAUS_SERVER_ORIGIN: `http://127.0.0.1:${peer.port}`,
            },
            stderr: 'pipe',
            stdout: 'pipe',
        });
        const [exitCode, stdout, stderr] = await Promise.all([
            child.exited,
            new Response(child.stdout).text(),
            new Response(child.stderr).text(),
        ]);
        expect(exitCode, stderr).toBe(0);
        expect(stdout).toContain('Verification URL:');
        expect(stdout).toContain('User code: ABCD-EFGH');
        expect(stdout).toContain('Haus Computer signed in.');
        expect(stdout).not.toContain('press Enter');
        expect(requests).toEqual([
            'POST /computer/login',
            'POST /computer/login/poll',
            'POST /computer/login/poll',
            'POST /computer/login/complete',
        ]);

        const sessionPath = join(dataRoot, 'login.json');
        const session = JSON.parse(await readFile(sessionPath, 'utf8')) as Record<string, string>;
        expect(session).toMatchObject({
            accessToken: 'gcl_at_access-token',
            origin: `http://127.0.0.1:${peer.port}`,
            refreshToken: 'gcl_rt_refresh-token',
            sessionId: 'cls_1234567890123456',
        });
        expect(typeof session.accessTokenExpiresAt).toBe('string');
        expect(typeof session.refreshTokenExpiresAt).toBe('string');
        expect(session).not.toHaveProperty('status');
        expect(session).not.toHaveProperty('deviceCode');
        expect(session).not.toHaveProperty('userCode');
        expect((await stat(dataRoot)).mode & 0o777).toBe(0o700);
        expect((await stat(sessionPath)).mode & 0o777).toBe(0o600);
    } finally {
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
}, 15_000);

test('setup preserves an unlinked attachment when replacement attachment fails', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-test-'));
    const serverId = 'srv_oldoldoldoldold1';
    const attachmentRoot = join(dataRoot, 'servers', serverId);
    await mkdir(attachmentRoot, { recursive: true });
    const peer = Bun.serve({
        async fetch(request) {
            const url = new URL(request.url);
            if (url.pathname === '/computer/validate') {
                return Response.json(
                    {
                        code: 'computer_machine_unlinked',
                        error: 'Computer credential was rejected.',
                    },
                    { status: 403 }
                );
            }
            if (url.pathname === '/computer/login') {
                return Response.json({
                    deviceCode: 'd'.repeat(43),
                    expiresAt: new Date(Date.now() + 60_000).toISOString(),
                    pollingIntervalMs: 1,
                    userCode: 'ABCD-EFGH',
                    verificationUrl: `${url.origin}/computer/login?code=ABCD-EFGH`,
                });
            }
            if (url.pathname === '/computer/login/poll') {
                return Response.json({
                    accessToken: `gcl_at_${'a'.repeat(43)}`,
                    accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
                    origin: url.origin,
                    refreshToken: `gcl_rt_${'b'.repeat(43)}`,
                    refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
                    sessionId: 'cls_1234567890123456',
                    status: 'approved',
                });
            }
            if (url.pathname === '/computer/attach') {
                await request.json();
                return Response.json(
                    {
                        code: 'computer_attachment_insufficient_role',
                        error: 'Only a Server Owner or Admin can attach a Computer.',
                    },
                    { status: 403 }
                );
            }
            return new Response('missing', { status: 404 });
        },
        port: 0,
    });
    await writeFile(
        join(attachmentRoot, 'attachment.json'),
        JSON.stringify({
            computerId: 'cmp_oldoldoldoldold1',
            credential: 'old-credential',
            serverId,
            serverOrigin: `http://127.0.0.1:${peer.port}`,
            slug: 'hq',
        })
    );
    try {
        const child = Bun.spawn(['bun', entrypoint, 'setup', '/hq'], {
            env: {
                ...process.env,
                HAUS_COMPUTER_DISABLE_BROWSER_OPEN: '1',
                HAUS_COMPUTER_DATA_ROOT: dataRoot,
                HAUS_SERVER_ORIGIN: `http://127.0.0.1:${peer.port}`,
            },
            stderr: 'pipe',
            stdout: 'pipe',
        });
        const stdout = new Response(child.stdout).text();
        expect(await child.exited).toBe(1);
        expect(await stdout).toContain('Open the URL above and enter the code if needed.');
        expect(await stdout).not.toContain('press Enter');
        expect(await stat(join(attachmentRoot, 'attachment.json'))).not.toBeNull();
        expect((await readdir(attachmentRoot)).some((file) => file.includes('.unlinked-'))).toBe(
            false
        );
    } finally {
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('setup archives an unlinked attachment before connecting a recreated Server', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-test-'));
    const oldServerId = 'srv_oldoldoldoldold1';
    const newServerId = 'srv_newnewnewnewnew1';
    const oldRoot = join(dataRoot, 'servers', oldServerId);
    await mkdir(oldRoot, { recursive: true });
    await writeFile(
        join(oldRoot, 'attachment.json'),
        JSON.stringify({
            computerId: 'cmp_oldoldoldoldold1',
            credential: 'old-credential',
            serverId: oldServerId,
            serverOrigin: 'placeholder',
            slug: 'hq',
        })
    );
    const peer = Bun.serve({
        async fetch(request, server) {
            const url = new URL(request.url);
            if (url.pathname === '/computer/validate') {
                const body = (await request.json()) as { serverId?: string };
                return body.serverId === oldServerId
                    ? Response.json(
                          {
                              code: 'computer_machine_unlinked',
                              error: 'Computer credential was rejected.',
                          },
                          { status: 403 }
                      )
                    : Response.json({ id: 'cmp_newnewnewnewnew1' });
            }
            if (url.pathname === '/computer/login' && request.method === 'POST') {
                return Response.json({
                    deviceCode: 'd'.repeat(43),
                    expiresAt: new Date(Date.now() + 60_000).toISOString(),
                    pollingIntervalMs: 1,
                    userCode: 'ABCD-EFGH',
                    verificationUrl: `${url.origin}/computer/login?code=ABCD-EFGH`,
                });
            }
            if (url.pathname === '/computer/login/poll') {
                return Response.json({
                    accessToken: `gcl_at_${'a'.repeat(43)}`,
                    accessTokenExpiresAt: new Date(Date.now() + 60_000).toISOString(),
                    origin: url.origin,
                    refreshToken: `gcl_rt_${'b'.repeat(43)}`,
                    refreshTokenExpiresAt: new Date(Date.now() + 86_400_000).toISOString(),
                    sessionId: 'cls_1234567890123456',
                    status: 'approved',
                });
            }
            if (url.pathname === '/computer/attach') {
                return Response.json({
                    computerId: 'cmp_newnewnewnewnew1',
                    idempotent: false,
                    serverId: newServerId,
                    slug: 'hq',
                });
            }
            if (url.pathname === '/computer/login/complete') {
                return Response.json({ status: 'completed' });
            }
            if (url.pathname === '/computer/attachment' && server.upgrade(request)) {
                return;
            }
            return new Response('missing', { status: 404 });
        },
        port: 0,
        websocket: {
            message(socket, message) {
                const frame = JSON.parse(String(message)) as { type?: string };
                if (frame.type === 'bootstrap') {
                    socket.send(JSON.stringify({ mode: 'ordinary', type: 'bootstrap-accepted' }));
                }
            },
        },
    });
    try {
        await writeFile(
            join(oldRoot, 'attachment.json'),
            JSON.stringify({
                computerId: 'cmp_oldoldoldoldold1',
                credential: 'old-credential',
                serverId: oldServerId,
                serverOrigin: `http://127.0.0.1:${peer.port}`,
                slug: 'hq',
            })
        );
        await runCli({
            ...process.env,
            HAUS_COMPUTER_DISABLE_BROWSER_OPEN: '1',
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_ONESHOT: '1',
            HAUS_COMPUTER_USAGE_DISABLED: '1',
            HAUS_SERVER_ORIGIN: `http://127.0.0.1:${peer.port}`,
        });

        const oldFiles = await readdir(oldRoot);
        expect(oldFiles).not.toContain('attachment.json');
        expect(
            oldFiles.some((file) =>
                /^attachment\.json\.unlinked-[0-9]+-[a-f0-9]{8}\.bak$/u.test(file)
            )
        ).toBe(true);
        expect(
            JSON.parse(
                await readFile(join(dataRoot, 'servers', newServerId, 'attachment.json'), 'utf8')
            )
        ).toMatchObject({
            computerId: 'cmp_newnewnewnewnew1',
            serverId: newServerId,
            slug: 'hq',
        });
    } finally {
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
}, 15_000);

test('resident start parks a terminally unlinked attachment instead of retrying', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-test-'));
    const serverId = 'srv_oldoldoldoldold1';
    const attachmentRoot = join(dataRoot, 'servers', serverId);
    await mkdir(attachmentRoot, { recursive: true });
    let validations = 0;
    const rejected = Promise.withResolvers<void>();
    const peer = Bun.serve({
        fetch(request) {
            if (new URL(request.url).pathname === '/computer/validate') {
                validations += 1;
                rejected.resolve();
                return Response.json(
                    {
                        code: 'computer_machine_unlinked',
                        error: 'Computer credential was rejected.',
                    },
                    { status: 403 }
                );
            }
            return new Response('missing', { status: 404 });
        },
        port: 0,
    });
    await writeFile(
        join(attachmentRoot, 'attachment.json'),
        JSON.stringify({
            computerId: 'cmp_oldoldoldoldold1',
            credential: 'old-credential',
            serverId,
            serverOrigin: `http://127.0.0.1:${peer.port}`,
            slug: 'hq',
        })
    );
    const child = Bun.spawn(['bun', entrypoint, 'start'], {
        env: {
            ...process.env,
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_RESIDENT: '1',
        },
        stderr: 'pipe',
        stdout: 'pipe',
    });
    try {
        await rejected.promise;
        await Bun.sleep(1200);
        expect(validations).toBe(1);
        expect(
            JSON.parse(await readFile(join(attachmentRoot, 'terminal-unlinked.json'), 'utf8'))
        ).toMatchObject({
            computerId: 'cmp_oldoldoldoldold1',
            reason: 'computer_machine_unlinked',
            statusCode: 403,
        });
    } finally {
        child.kill();
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
}, 5000);

test('the Server attachment daemon stays connected until the Server closes it', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-test-'));
    const connected = Promise.withResolvers<void>();
    const sockets = new Set<ServerWebSocket<undefined>>();
    const peer = Bun.serve({
        fetch(request, server) {
            const pathname = new URL(request.url).pathname;
            if (pathname === '/computer/validate') {
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
                if (frame.type === 'bootstrap') {
                    socket.send(JSON.stringify({ mode: 'ordinary', type: 'bootstrap-accepted' }));
                    connected.resolve();
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
        env: { ...process.env, HAUS_COMPUTER_DATA_ROOT: dataRoot },
        stderr: 'pipe',
        stdout: 'pipe',
    });
    try {
        await Promise.race([
            connected.promise,
            child.exited.then(async (code) => {
                throw new Error(
                    `Computer exited ${code} before connecting: ${await new Response(child.stderr).text()}`
                );
            }),
        ]);
        await Bun.sleep(50);
        expect(child.exitCode).toBeNull();
    } finally {
        for (const socket of sockets) {
            socket.close();
        }
        child.kill();
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('a watch-mode attachment daemon reconnects instead of idling in the watcher', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-test-'));
    const reconnected = Promise.withResolvers<void>();
    const sockets = new Set<ServerWebSocket<undefined>>();
    let connections = 0;
    const peer = Bun.serve({
        fetch(request, server) {
            const pathname = new URL(request.url).pathname;
            if (pathname === '/computer/validate') {
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
    // The dev resident spawns daemons under `bun --watch`, where a finished
    // script leaves an idle watcher holding the daemon's pid, so the resident
    // never respawns it. The daemon must reconnect inside the same process.
    const child = Bun.spawn(['bun', entrypoint, 'start'], {
        env: {
            ...process.env,
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_RESIDENT: '1',
            HAUS_COMPUTER_USAGE_DISABLED: '1',
            HAUS_COMPUTER_WATCH_ATTACHMENT_DAEMON: '1',
        },
        stderr: 'pipe',
        stdout: 'pipe',
    });
    try {
        await Promise.race([
            reconnected.promise,
            Bun.sleep(9000).then(() => {
                throw new Error(
                    'The watch-mode attachment daemon did not reconnect after the Server closed its socket.'
                );
            }),
        ]);
        expect(connections).toBe(2);
    } finally {
        for (const socket of sockets) {
            socket.close();
        }
        child.kill();
        await killAttachmentDaemon(attachmentRoot);
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
}, 12_000);

test('resident start reconnects an attachment after the Server closes it', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-test-'));
    const reconnected = Promise.withResolvers<void>();
    const sockets = new Set<ServerWebSocket<undefined>>();
    let connections = 0;
    const peer = Bun.serve({
        fetch(request, server) {
            const pathname = new URL(request.url).pathname;
            if (pathname === '/computer/validate') {
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
    const child = Bun.spawn(['bun', entrypoint, 'start'], {
        env: {
            ...process.env,
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_RESIDENT: '1',
            HAUS_COMPUTER_USAGE_DISABLED: '1',
        },
        stderr: 'pipe',
        stdout: 'pipe',
    });
    try {
        await Promise.race([
            reconnected.promise,
            Bun.sleep(5000).then(async () => {
                const marker = await readFile(
                    join(attachmentRoot, 'attachment-daemon.pid'),
                    'utf8'
                ).catch(() => 'missing');
                throw new Error(
                    `Computer did not reconnect after the Server closed its socket. Attachment daemon: ${marker}`
                );
            }),
        ]);
        expect(connections).toBe(2);
    } finally {
        for (const socket of sockets) {
            socket.close();
        }
        child.kill();
        await killAttachmentDaemon(attachmentRoot);
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('resident start reconnects an attachment when Server heartbeats silently stop', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-test-'));
    const reconnected = Promise.withResolvers<void>();
    const sockets = new Set<ServerWebSocket<undefined>>();
    let connections = 0;
    let heartbeats = 0;
    const peer = Bun.serve({
        fetch(request, server) {
            const pathname = new URL(request.url).pathname;
            if (pathname === '/computer/validate') {
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
                const frame = JSON.parse(String(message)) as { id?: number; type?: string };
                if (frame.type === 'bootstrap') {
                    connections += 1;
                    socket.send(JSON.stringify({ mode: 'ordinary', type: 'bootstrap-accepted' }));
                    if (connections > 1) {
                        reconnected.resolve();
                    }
                    return;
                }
                if (frame.type === 'heartbeat-negotiate') {
                    if (connections === 1) {
                        socket.send(
                            JSON.stringify({
                                intervalMs: 100,
                                timeoutMs: 300,
                                type: 'heartbeat-configuration',
                            })
                        );
                    }
                    return;
                }
                if (frame.type === 'heartbeat') {
                    heartbeats += 1;
                    if (heartbeats === 1) {
                        socket.send(JSON.stringify({ id: frame.id, type: 'heartbeat-ack' }));
                    }
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
    const child = Bun.spawn(['bun', entrypoint, 'start'], {
        env: {
            ...process.env,
            HAUS_COMPUTER_DATA_ROOT: dataRoot,
            HAUS_COMPUTER_RESIDENT: '1',
            HAUS_COMPUTER_USAGE_DISABLED: '1',
        },
        stderr: 'pipe',
        stdout: 'pipe',
    });
    try {
        await Promise.race([
            reconnected.promise,
            Bun.sleep(5000).then(async () => {
                const marker = await readFile(
                    join(attachmentRoot, 'attachment-daemon.pid'),
                    'utf8'
                ).catch(() => 'missing');
                throw new Error(
                    `Computer did not reconnect after Server heartbeats stopped. Attachment daemon: ${marker}`
                );
            }),
        ]);
        expect(heartbeats).toBeGreaterThan(1);
        expect(connections).toBe(2);
    } finally {
        for (const socket of sockets) {
            socket.close();
        }
        child.kill();
        await killAttachmentDaemon(attachmentRoot);
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
}, 7000);

test('the resident service keeps its state root outside executable code', () => {
    const plist = launchdPlist({
        args: ['/opt/haus/package/index.ts'],
        executable: '/opt/haus/bin/bun',
    });
    expect(plist).toContain('<string>com.haus.computer</string>');
    expect(plist).toContain('<key>HAUS_COMPUTER_DATA_ROOT</key>');
    expect(plist).toContain('.haus/computer');
    expect(plist).toContain('<key>StandardOutPath</key>');
    expect(plist).toContain('.haus/computer/logs/computer.log');
    expect(plist).toContain('<key>PATH</key>');
    expect(plist).toContain('/opt/homebrew/bin');
    expect(plist).toContain('/usr/local/bin');
    expect(plist).toContain('/.local/bin');
    expect(plist).not.toContain('/opt/haus/package/.haus');
});

test('startup reopens admission after an interrupted update', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-test-'));
    try {
        await writeUpdateProgress(
            dataRoot,
            progress('waiting-for-agents', '1.1.0', 'Waiting for active Agents.')
        );
        await recoverInterruptedUpdate(dataRoot);
        expect(await readUpdateProgress(dataRoot)).toMatchObject({
            detail: expect.stringContaining('interrupted'),
            failedPhase: 'waiting-for-agents',
            phase: 'failed',
            targetVersion: '1.1.0',
        });
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});

/**
 * Attachment daemons reconnect forever by design, so tests that leave one
 * running must kill it by its durable pid marker; killing the resident child
 * alone leaks the daemon past the test.
 */
async function killAttachmentDaemon(attachmentRoot: string) {
    try {
        const marker = JSON.parse(
            await readFile(join(attachmentRoot, 'attachment-daemon.pid'), 'utf8')
        ) as { pid?: number };
        if (typeof marker.pid === 'number') {
            process.kill(marker.pid, 'SIGKILL');
        }
    } catch {
        // The daemon already exited or never started.
    }
}

async function runCli(environment: Record<string, string | undefined>) {
    const child = Bun.spawn(['bun', entrypoint, 'setup', '/hq'], {
        env: environment,
        stderr: 'pipe',
        stdout: 'pipe',
    });
    const exitCode = await child.exited;
    expect(exitCode, await new Response(child.stderr).text()).toBe(0);
}

async function waitForFile(path: string): Promise<string> {
    for (let attempt = 0; attempt < 100; attempt += 1) {
        try {
            return await readFile(path, 'utf8');
        } catch {
            await Bun.sleep(10);
        }
    }
    throw new Error(`Timed out waiting for ${path}.`);
}
