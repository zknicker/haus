// Ported from botiverse/raft-source packages/daemon/src/drivers/runtimeSession.test.ts (FSL-1.1-ALv2)
import { expect, test } from 'bun:test';
import { PassThrough } from 'node:stream';
import { readLines, spawnClaudeProcess } from './claude-process.ts';

test('child-process runtime session decodes split UTF-8 stdout before line parsing', async () => {
    const stream = new PassThrough();
    const lines: string[] = [];
    readLines(stream, (line) => lines.push(line));
    const ended = new Promise((resolve) => stream.once('end', resolve));
    const bytes = Buffer.from(`${JSON.stringify({ text: 'héllo 🌊' })}\r\n{"text":"tail"}`);
    const splitAt = bytes.indexOf(Buffer.from('🌊')) + 2;
    stream.write(bytes.subarray(0, splitAt));
    stream.write(bytes.subarray(splitAt));
    stream.end();
    await ended;
    // The final line arrives without its newline at end of stream.
    expect(lines).toEqual(['{"text":"héllo 🌊"}', '{"text":"tail"}']);
});

test('a failed spawn settles exit exactly once and refuses writes', async () => {
    const child = spawnClaudeProcess({
        args: [],
        binaryPath: '/nonexistent/claude',
        cwd: '/',
        env: {},
    });
    const exit = await child.exited;
    expect(exit).toEqual({ code: null, signal: null });
    expect(child.alive).toBe(false);
    expect(child.stderrTail().join(' ')).toContain('ENOENT');
    await expect(child.write('{}')).rejects.toThrow('stdin is closed');
});

test('stdin writes resolve once flushed and stdout arrives line by line', async () => {
    const child = spawnClaudeProcess({
        args: [
            '-e',
            'for await (const line of console) { console.log(JSON.stringify({ echo: line })); if (line === "bye") process.exit(4); }',
        ],
        binaryPath: process.execPath,
        cwd: '/',
        env: { PATH: process.env.PATH ?? '' },
    });
    const lines: string[] = [];
    child.onLine((line) => lines.push(line));
    await child.write('hello');
    await child.write('bye');
    expect(await child.exited).toEqual({ code: 4, signal: null });
    expect(lines).toEqual(['{"echo":"hello"}', '{"echo":"bye"}']);
});

test('stop ends the whole process group, children included', async () => {
    const child = spawnClaudeProcess({
        args: ['-c', 'sleep 60 & echo "$!"; wait'],
        binaryPath: '/bin/sh',
        cwd: '/',
        env: { PATH: process.env.PATH ?? '' },
    });
    const grandchild = await new Promise<number>((resolve) =>
        child.onLine((line) => resolve(Number(line)))
    );
    await child.stop();
    expect(child.alive).toBe(false);
    expect(() => process.kill(grandchild, 0)).toThrow();
});

test('stderr keeps a bounded tail for crash diagnostics', async () => {
    const child = spawnClaudeProcess({
        args: ['-c', 'for i in $(seq 1 30); do echo "line $i" >&2; done; exit 2'],
        binaryPath: '/bin/sh',
        cwd: '/',
        env: { PATH: process.env.PATH ?? '' },
    });
    expect(await child.exited).toEqual({ code: 2, signal: null });
    const tail = child.stderrTail();
    expect(tail).toHaveLength(20);
    expect(tail.at(-1)).toBe('line 30');
});
