import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { type ChildProcessByStdio, spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { openLockedDesktop } from './desktop-lock.ts';

const holderScript = join(import.meta.dir, 'fixtures', 'hold-desktop-lock.ts');
const lockTempFail = 75;

let root: string;
let lockPath: string;

beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'haus-desktop-lock-'));
    lockPath = join(root, 'computer-use.lock');
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

describe.if(process.platform === 'darwin')('the machine-wide desktop lock', () => {
    test('two processes never hold it at once', async () => {
        const events: string[] = [];
        const first = startHolder('first', events);
        await first.reached('held');
        expect(tryLock()).toBe(lockTempFail);

        const second = startHolder('second', events);
        await second.reached('waiting');
        expect(tryLock()).toBe(lockTempFail);

        events.push('test releases first');
        first.child.stdin.write('release\n');
        await second.reached('held');
        await first.reached('released');
        expect(events.slice(0, 4)).toEqual([
            'first waiting',
            'first held',
            'second waiting',
            'test releases first',
        ]);
        expect(tryLock()).toBe(lockTempFail);

        second.child.stdin.write('release\n');
        await Promise.all([first.exited, second.exited]);
        expect(tryLock()).toBe(0);
    });

    test('a holder that dies lets the next process in', async () => {
        const events: string[] = [];
        const first = startHolder('first', events);
        await first.reached('held');
        const second = startHolder('second', events);
        await second.reached('waiting');

        first.child.kill('SIGKILL');
        await second.reached('held');
        expect(tryLock()).toBe(lockTempFail);

        second.child.stdin.write('release\n');
        await Promise.all([first.exited, second.exited]);
        expect(tryLock()).toBe(0);
    });

    test('a cancelled wait gives up without taking the lock', async () => {
        const first = startHolder('first', []);
        await first.reached('held');
        const controller = new AbortController();
        const waiting = openLockedDesktop(lockPath, trueCommand, controller.signal);
        controller.abort('cancel');
        await expect(waiting).rejects.toBe('cancel');

        first.child.stdin.write('release\n');
        await first.exited;
        expect(tryLock()).toBe(0);
    });

    test('a daemon that dies takes its running command down with the lock', async () => {
        const daemon = startHolder('daemon', [], 'run');
        const pid = Number((await daemon.reachedPrefix('command ')).slice('command '.length));
        expect(processState(pid)).not.toBe('');

        daemon.child.kill('SIGKILL');
        await daemon.exited;
        const next = await openLockedDesktop(lockPath, trueCommand, new AbortController().signal);
        expect(['', 'Z']).toContain(processState(pid).slice(0, 1));
        await next.abandon();
        expect(tryLock()).toBe(0);
    });
});

const trueCommand = { args: [], env: {}, executable: '/usr/bin/true' };

function processState(pid: number) {
    return spawnSync('/bin/ps', ['-o', 'stat=', '-p', String(pid)])
        .stdout.toString()
        .trim();
}

function tryLock() {
    return spawnSync('/usr/bin/lockf', ['-k', '-t', '0', lockPath, '/usr/bin/true']).status;
}

function startHolder(name: string, events: string[], mode: 'hold' | 'run' = 'hold') {
    const child: ChildProcessByStdio<Writable, Readable, null> = spawn(
        process.execPath,
        [holderScript, mode, lockPath],
        { stdio: ['pipe', 'pipe', 'inherit'] }
    );
    const seen = new Set<string>();
    const waiters: { line: string; resolve: (line: string) => void }[] = [];
    let buffered = '';
    child.stdout.on('data', (data: Buffer) => {
        buffered += data.toString();
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
            events.push(`${name} ${line}`);
            seen.add(line);
            for (const waiter of waiters.filter((entry) => line.startsWith(entry.line))) {
                waiter.resolve(line);
            }
        }
    });
    return {
        child,
        exited: new Promise<void>((resolve) => child.once('close', () => resolve())),
        reached: async (line: string) => {
            if (!seen.has(line)) {
                await new Promise<string>((resolve) => waiters.push({ line, resolve }));
            }
        },
        reachedPrefix: (prefix: string) =>
            new Promise<string>((resolve) => {
                const earlier = [...seen].find((line) => line.startsWith(prefix));
                if (earlier) {
                    resolve(earlier);
                } else {
                    waiters.push({ line: prefix, resolve });
                }
            }),
    };
}
