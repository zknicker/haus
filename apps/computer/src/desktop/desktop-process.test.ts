import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type LockedCommand, openLockedDesktop } from './desktop-lock.ts';
import { runDesktopProcess } from './desktop-process.ts';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-desktop-process-'));
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

describe.if(process.platform === 'darwin')('desktop processes', () => {
    test('cancel kills the lock, the display hold, and every process the command started', async () => {
        const controller = new AbortController();
        const desktop = await open(
            {
                args: ['-d', '/bin/sh', '-c', '/usr/bin/tail -f /dev/null & echo ready; wait'],
                env: {},
                executable: '/usr/bin/caffeinate',
            },
            controller.signal
        );
        const running = runDesktopProcess(desktop, {
            logPath: join(root, 'cancel.log'),
            signal: controller.signal,
        });
        await new Promise((resolve) => desktop.child.stdout?.once('data', resolve));

        controller.abort('cancel');
        expect(await running).toMatchObject({ outcome: 'cancelled' });
        expect(desktop.child.signalCode).toBe('SIGKILL');
    });

    test('a command aborted before it starts answers timed-out without running', async () => {
        const controller = new AbortController();
        const desktop = await open(
            { args: ['-c', 'echo ran'], env: {}, executable: '/bin/sh' },
            controller.signal
        );
        controller.abort('timeout');
        expect(
            await runDesktopProcess(desktop, {
                logPath: join(root, 'timed-out.log'),
                signal: controller.signal,
            })
        ).toMatchObject({
            outcome: 'timed-out',
            output: { text: expect.not.stringContaining('ran') },
        });
    });

    test('a finished command answers its output and exit code', async () => {
        const signal = new AbortController().signal;
        const desktop = await open(
            { args: ['-c', 'echo snapshot; exit 2'], env: {}, executable: '/bin/sh' },
            signal
        );
        expect(
            await runDesktopProcess(desktop, { logPath: join(root, 'done.log'), signal })
        ).toEqual({
            exitCode: 2,
            logPath: join(root, 'done.log'),
            outcome: 'completed',
            output: { kind: 'text', text: 'snapshot\n' },
            truncated: false,
        });
    });
});

async function open(command: LockedCommand, signal: AbortSignal) {
    return await openLockedDesktop(join(root, 'computer-use.lock'), command, signal);
}
