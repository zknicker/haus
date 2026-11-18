import { expect, test } from 'bun:test';
import { spawn } from 'node:child_process';
import { isProcessGroupAlive, parseProcStat } from './process-group-liveness.ts';

test('parses a process state and group past a comm containing parens', () => {
    expect(parseProcStat('42 (a) b)) S 1 42 42 0')).toEqual({ processGroupId: 42, state: 'S' });
    expect(parseProcStat('43 (sleep) Z 1 40 40 0')).toEqual({ processGroupId: 40, state: 'Z' });
});

test('a process group is alive until its last member exits', async () => {
    const child = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
    const exited = new Promise((resolve) => child.once('exit', resolve));
    expect(isProcessGroupAlive(child.pid)).toBe(true);
    process.kill(-(child.pid as number), 'SIGKILL');
    await exited;
    expect(isProcessGroupAlive(child.pid)).toBe(false);
    expect(isProcessGroupAlive(undefined)).toBe(false);
});
