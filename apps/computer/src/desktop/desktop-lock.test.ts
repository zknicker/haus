import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { type ChildProcessByStdio, spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Readable, Writable } from 'node:stream';
import { holdDesktopLock } from './desktop-lock.ts';

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
        const waiting = holdDesktopLock(lockPath, controller.signal);
        controller.abort('cancel');
        await expect(waiting).rejects.toBe('cancel');

        first.child.stdin.write('release\n');
        await first.exited;
        expect(tryLock()).toBe(0);
    });
});

function tryLock() {
    return spawnSync('/usr/bin/lockf', ['-k', '-t', '0', lockPath, '/usr/bin/true']).status;
}

function startHolder(name: string, events: string[]) {
    const child: ChildProcessByStdio<Writable, Readable, null> = spawn(
        process.execPath,
        [holderScript, lockPath],
        { stdio: ['pipe', 'pipe', 'inherit'] }
    );
    const seen = new Set<string>();
    const waiters: { line: string; resolve: () => void }[] = [];
    let buffered = '';
    child.stdout.on('data', (data: Buffer) => {
        buffered += data.toString();
        const lines = buffered.split('\n');
        buffered = lines.pop() ?? '';
        for (const line of lines) {
            events.push(`${name} ${line}`);
            seen.add(line);
            for (const waiter of waiters.filter((entry) => entry.line === line)) {
                waiter.resolve();
            }
        }
    });
    return {
        child,
        exited: new Promise<void>((resolve) => child.once('close', () => resolve())),
        reached: (line: string) =>
            seen.has(line)
                ? Promise.resolve()
                : new Promise<void>((resolve) => waiters.push({ line, resolve })),
    };
}
