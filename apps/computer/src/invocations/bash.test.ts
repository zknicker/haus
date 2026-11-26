import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { bashRunner } from './bash.ts';
import { operationSession } from './operation-session.test-support.ts';
import { inlinePayloads } from './operation.ts';
import { OutputTail } from './pi/output-tail.ts';

let testDir: string;
let logPath: string;

beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'haus-bash-'));
    logPath = join(testDir, 'inv-1.log');
});

afterEach(async () => {
    await rm(testDir, { force: true, recursive: true });
});

describe('bash tool', () => {
    test('should execute simple commands', async () => {
        expect(await bash("echo 'test output'")).toEqual({
            exitCode: 0,
            logPath,
            outcome: 'completed',
            output: { kind: 'text', text: 'test output\n' },
            truncated: false,
        });
    });

    test('should report non-zero exit codes with the exit line', async () => {
        const failed = await bash('echo out; exit 3');
        expect(failed.exitCode).toBe(3);
        expect(failed.outcome).toBe('completed');
        expect(text(failed)).toBe('out\n\n\nCommand exited with code 3');

        expect(text(await bash('true'))).toBe('(no output)');
    });

    test('should report signal-killed commands as 128 plus the signal number', async () => {
        for (const { exitCode, signal } of [
            { exitCode: 137, signal: 'KILL' },
            { exitCode: 143, signal: 'TERM' },
        ]) {
            const result = await bash(`printf 'before-kill\\n'; kill -${signal} $$`);
            expect(result.exitCode).toBe(exitCode);
            expect(text(result)).toBe(`before-kill\n\n\nCommand exited with code ${exitCode}`);
        }
    });

    test('should throw error when cwd does not exist', async () => {
        const missing = join(testDir, 'missing');
        await expect(bash('echo test', missing)).rejects.toThrow(
            `Working directory does not exist: ${missing}\nCannot execute bash commands.`
        );
    });

    test('should not count a trailing newline as an extra truncated bash output line', async () => {
        const result = await bash("seq -f 'line-%04g' 1 4000");
        const output = text(result);

        expect(result.truncated).toBe(true);
        expect(output.startsWith('line-2001\n')).toBe(true);
        expect(output).toEndWith(
            `line-4000\n\n[Showing lines 2001-4000 of 4000. Full output: ${logPath}]`
        );
        expect(output).not.toContain('4001');
    });

    test('should show the end of an over-long last line after a short line', async () => {
        const result = await bash(
            "printf 'first line\\n'; head -c 219000 /dev/zero | tr '\\0' y; printf 'END\\n'"
        );
        const output = text(result);

        expect(result.truncated).toBe(true);
        expect(output).toContain('yyyyEND');
        expect(output).toMatch(/\[Showing last 50\.0KB of line 2 /u);
    });

    test('should decode UTF-8 characters split across output chunks', async () => {
        const euro = Buffer.from('€\n', 'utf-8');
        const tail = new OutputTail(logPath);
        tail.append(euro.subarray(0, 1), 'stdout');
        tail.append(euro.subarray(1), 'stdout');
        tail.finish();
        await tail.close();

        expect(tail.snapshot().content).toBe('€\n');
        expect(await readFile(logPath, 'utf8')).toBe('€\n');
    });

    test('decodes stdout and stderr apart when their chunks interleave', async () => {
        const euro = Buffer.from('€\n', 'utf-8');
        const tail = new OutputTail(logPath);
        tail.append(euro.subarray(0, 1), 'stdout');
        tail.append(Buffer.from('err\n'), 'stderr');
        tail.append(euro.subarray(1), 'stdout');
        tail.finish();
        await tail.close();

        expect(tail.snapshot().content).toBe('err\n€\n');
        expect([...(await readFile(logPath))]).toEqual([
            0xe2, 0x65, 0x72, 0x72, 0x0a, 0x82, 0xac, 0x0a,
        ]);
    });

    test('should persist full output when truncation happens by line count only', async () => {
        const result = await bash('seq 3000');
        const output = text(result);

        expect(result.truncated).toBe(true);
        expect(result.logPath).toBe(logPath);
        expect(output).toEndWith(`\n\n[Showing lines 1001-3000 of 3000. Full output: ${logPath}]`);
        const fullOutput = await readFile(logPath, 'utf8');
        expect(fullOutput.startsWith('1\n2\n3\n')).toBe(true);
        expect(fullOutput.endsWith('2998\n2999\n3000\n')).toBe(true);
    });
});

async function bash(command: string, cwd = testDir) {
    return await bashRunner(
        { command, kind: 'bash' },
        {
            agentId: 'agent-1',
            cwd,
            env: { PATH: process.env.PATH ?? '' },
            invocationId: 'inv-1',
            logPath,
            payloads: inlinePayloads,
            signal: new AbortController().signal,
            timeoutMs: 120_000,
            ...operationSession(),
        }
    );
}

function text(result: Awaited<ReturnType<typeof bash>>) {
    if (result.output.kind !== 'text') {
        throw new Error(`Expected text output, got ${result.output.kind}.`);
    }
    return result.output.text;
}
