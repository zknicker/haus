import { expect, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { progress, readUpdateProgress, writeUpdateProgress } from './update.ts';
import type { ComputerUpdateProgress } from './update-contract.ts';
import { finishRestart, recoverInterruptedUpdate } from './update-recovery.ts';

const entrypoint = fileURLToPath(new URL('./index.ts', import.meta.url));

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

test('a restart completes only a restarting update', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-test-'));
    try {
        await writeUpdateProgress(dataRoot, progress('installing', '1.1.0', 'Installing update.'));
        await finishRestart(dataRoot);
        expect((await readUpdateProgress(dataRoot)).phase).toBe('installing');

        await writeUpdateProgress(dataRoot, progress('restarting', '1.1.0', 'Restarting.'));
        await finishRestart(dataRoot);
        expect(await readUpdateProgress(dataRoot)).toMatchObject({
            phase: 'complete',
            targetVersion: '1.1.0',
        });
    } finally {
        await rm(dataRoot, { force: true, recursive: true });
    }
});

test('an attachment daemon reports a restarted update as complete on reconnect', async () => {
    const dataRoot = await mkdtemp(join(tmpdir(), 'haus-computer-test-'));
    const bootstrapped = Promise.withResolvers<ComputerUpdateProgress>();
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
            message(_socket, message) {
                const frame = JSON.parse(String(message)) as {
                    type?: string;
                    update?: ComputerUpdateProgress;
                };
                if (frame.type === 'bootstrap' && frame.update) {
                    bootstrapped.resolve(frame.update);
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
    await writeUpdateProgress(dataRoot, progress('restarting', '1.1.0', 'Restarting.'));
    const child = Bun.spawn(['bun', entrypoint, '__attachment-daemon', serverId], {
        env: { ...process.env, HAUS_COMPUTER_DATA_ROOT: dataRoot },
        stderr: 'pipe',
        stdout: 'pipe',
    });
    try {
        const update = await Promise.race([
            bootstrapped.promise,
            child.exited.then(async (code) => {
                throw new Error(
                    `Computer exited ${code} before connecting: ${await new Response(child.stderr).text()}`
                );
            }),
        ]);
        expect(update).toMatchObject({ phase: 'complete', targetVersion: '1.1.0' });
    } finally {
        child.kill();
        peer.stop(true);
        await rm(dataRoot, { force: true, recursive: true });
    }
});
