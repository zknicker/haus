import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runDesktopProcess, spawnDesktopProcess } from './desktop-process.ts';

let root: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-desktop-process-'));
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

describe.if(process.platform === 'darwin')('desktop processes', () => {
    test('cancel kills the display hold and every process the command started', async () => {
        const controller = new AbortController();
        const child = spawnDesktopProcess({
            args: ['-d', '/bin/sh', '-c', '/usr/bin/tail -f /dev/null & echo ready; wait'],
            env: {},
            executable: '/usr/bin/caffeinate',
            signal: controller.signal,
        });
        const closed = new Promise<void>((resolve) => child.once('close', () => resolve()));
        await new Promise((resolve) => child.stdout.once('data', resolve));
        child.stdout.resume();
        child.stderr.resume();

        controller.abort('cancel');
        await closed;
        expect(child.signalCode).toBe('SIGKILL');
    });

    test('a cancelled command answers cancelled and a timed-out one timed-out', async () => {
        const cancelled = new AbortController();
        cancelled.abort('cancel');
        const timedOut = new AbortController();
        timedOut.abort('timeout');
        const command = { args: ['-f', '/dev/null'], env: {}, executable: '/usr/bin/tail' };

        expect(
            await runDesktopProcess({
                ...command,
                logPath: join(root, 'cancelled.log'),
                signal: cancelled.signal,
            })
        ).toMatchObject({ outcome: 'cancelled' });
        expect(
            await runDesktopProcess({
                ...command,
                logPath: join(root, 'timed-out.log'),
                signal: timedOut.signal,
            })
        ).toMatchObject({ outcome: 'timed-out' });
    });

    test('a finished command answers its output and exit code', async () => {
        expect(
            await runDesktopProcess({
                args: ['-c', 'echo snapshot; exit 2'],
                env: {},
                executable: '/bin/sh',
                logPath: join(root, 'done.log'),
                signal: new AbortController().signal,
            })
        ).toEqual({
            exitCode: 2,
            logPath: join(root, 'done.log'),
            outcome: 'completed',
            output: { kind: 'text', text: 'snapshot\n' },
            truncated: false,
        });
    });
});
