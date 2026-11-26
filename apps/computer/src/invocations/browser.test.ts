import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBrowserRunner, streamedResult } from './browser.ts';
import { inlinePayloads } from './operation.ts';
import { operationSession } from './operation-session.test-support.ts';

let testDir: string;

beforeEach(async () => {
    testDir = await mkdtemp(join(tmpdir(), 'haus-browser-'));
});

afterEach(async () => {
    await rm(testDir, { force: true, recursive: true });
});

const context = {
    agentId: 'agent-1',
    cwd: '/workspace',
    env: {},
    invocationId: 'invocation-1',
    logPath: '/workspace/invocation-1.log',
    payloads: inlinePayloads,
    signal: new AbortController().signal,
    timeoutMs: 60_000,
    ...operationSession(),
};

describe('browser invocations', () => {
    test('a command outside the allowlist fails without reaching the browser', async () => {
        const run = createBrowserRunner({ browserRoot: '/no-browser' });
        expect(await run({ args: ['close'], kind: 'browser' }, context)).toEqual({
            outcome: 'failed',
            output: {
                kind: 'text',
                text: 'Use a browser page command. Connection overrides and browser-wide lifecycle commands are not allowed.',
            },
            truncated: false,
        });
    });

    test('a Computer with no browser for this attachment fails with the setup hint', async () => {
        const run = createBrowserRunner({ browserRoot: '/no-browser' });
        expect(await run({ args: ['snapshot', '-i'], kind: 'browser' }, context)).toEqual({
            outcome: 'failed',
            output: {
                kind: 'text',
                text: 'Browser is disabled or unavailable. Configure it in this Computer’s settings.',
            },
            truncated: false,
        });
    });

    test('output over 1 MiB returns the tail and keeps the full log', async () => {
        const logPath = join(testDir, 'invocation-1.log');
        const result = await streamedResult(
            {
                args: ['-c', 'seq 1 200000'],
                executable: '/bin/sh',
                signal: new AbortController().signal,
            },
            logPath
        );

        const tail = Array.from({ length: 2000 }, (_, index) => index + 198_001).join('\n');
        expect(result).toEqual({
            exitCode: 0,
            logPath,
            outcome: 'completed',
            output: {
                kind: 'text',
                text: `${tail}\n\n[Showing lines 198001-200000 of 200000. Full output: ${logPath}]`,
            },
            truncated: true,
        });
        const full = Array.from({ length: 200_000 }, (_, index) => index + 1).join('\n');
        expect(await readFile(logPath, 'utf8')).toBe(`${full}\n`);
    });
});
