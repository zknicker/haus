import { describe, expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { killProcessTree, signalProcess, waitForChildProcess } from './shell.ts';

describe('killProcessTree', () => {
    test('kills the whole process group, background children included', async () => {
        const child = spawn('/bin/bash', ['-c', 'sleep 30 & echo $!; wait'], {
            detached: true,
            stdio: ['ignore', 'pipe', 'ignore'],
        });
        const [line] = (await once(child.stdout, 'data')) as [Buffer];
        const grandchild = Number(line.toString().trim());

        killProcessTree(pid(child));
        const [, signal] = await once(child, 'exit');

        expect(signal).toBe('SIGKILL');
        expect(processState(grandchild)).toBe('gone');
    });

    test('falls back to killing the shell when the group kill fails', async () => {
        const child = spawn('sleep', ['30'], { stdio: 'ignore' });
        await once(child, 'spawn');

        expect(signalProcess(-pid(child), 'SIGKILL')).toBe(false);
        killProcessTree(pid(child));
        const [, signal] = await once(child, 'exit');

        expect(signal).toBe('SIGKILL');
    });

    test('tolerates failure of both group signals and the fallback', async () => {
        const child = spawn('true', [], { detached: true, stdio: 'ignore' });
        await once(child, 'exit');

        expect(signalProcess(-pid(child), 'SIGKILL')).toBe(false);
        expect(() => killProcessTree(pid(child))).not.toThrow();
    });
});

describe('waitForChildProcess', () => {
    test('resolves with the exit code while a background child holds the pipes', async () => {
        const child = spawn('/bin/bash', ['-c', 'sleep 30 & echo $!; exit 4'], {
            detached: true,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        let output = '';
        child.stdout.on('data', (data: Buffer) => {
            output += data.toString();
        });

        expect(await waitForChildProcess(child)).toBe(4);

        const grandchild = Number(output.trim());
        expect(processState(grandchild)).not.toBe('gone');
        killProcessTree(pid(child));
    });

    test('rejects when the shell cannot be spawned', async () => {
        const child = spawn('/nonexistent-shell-path-xyz123', ['-c', 'echo test'], {
            stdio: ['ignore', 'pipe', 'pipe'],
        });

        await expect(waitForChildProcess(child)).rejects.toThrow(/ENOENT/u);
    });
});

function pid(child: { pid?: number | undefined }) {
    if (child.pid === undefined) {
        throw new Error('The child process has no pid.');
    }
    return child.pid;
}

function processState(pidToCheck: number) {
    const state = Bun.spawnSync(['ps', '-o', 'stat=', '-p', String(pidToCheck)])
        .stdout.toString()
        .trim();
    return state === '' || state.startsWith('Z') ? 'gone' : state;
}
