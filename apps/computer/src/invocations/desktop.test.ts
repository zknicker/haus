import { describe, expect, test } from 'bun:test';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { desktopInstallHint, withScreenshotPath } from '../desktop/desktop-command.ts';
import { createDesktopRunner } from './desktop.ts';
import { inlinePayloads, textResult } from './operation.ts';

const context = {
    agentId: 'agent-1',
    cwd: '/workspace',
    env: {},
    invocationId: 'invocation-1',
    logPath: '/agents/agent-1/runtime/invocations/invocation-1.log',
    payloads: inlinePayloads,
    signal: new AbortController().signal,
    timeoutMs: 60_000,
};

function failed(text: string) {
    return textResult('failed', text);
}

describe('desktop invocations', () => {
    test('a Computer off macOS fails before resolving agent-desktop', async () => {
        const run = createDesktopRunner({ platform: 'linux' });
        expect(await run({ args: ['snapshot', '-i'], kind: 'desktop' }, context)).toEqual(
            failed('Computer use runs on macOS Devices.')
        );
    });

    test('a refused command fails without reaching agent-desktop', async () => {
        const run = createDesktopRunner({ platform: 'darwin' });
        expect(await run({ args: ['session', 'start'], kind: 'desktop' }, context)).toEqual(
            failed(
                'Use one agent-desktop command that looks at or acts on apps. Sessions, batches, traces, held keys, and identity flags are not allowed.'
            )
        );
    });

    test('a Computer without agent-desktop fails with the install hint', async () => {
        const empty = await mkdtemp(join(tmpdir(), 'haus-desktop-'));
        const run = createDesktopRunner({ platform: 'darwin', searchPath: empty });
        expect(await run({ args: ['click', '@s1:e1'], kind: 'desktop' }, context)).toEqual(
            failed(desktopInstallHint)
        );
    });

    test('a screenshot without a path is written beside the invocation log', () => {
        expect(withScreenshotPath(['screenshot', '--app', 'Finder'], context.logPath)).toEqual([
            'screenshot',
            '--app',
            'Finder',
            '/agents/agent-1/runtime/invocations/invocation-1.png',
        ]);
        expect(withScreenshotPath(['screenshot', '/tmp/shot.png'], context.logPath)).toEqual([
            'screenshot',
            '/tmp/shot.png',
        ]);
        expect(withScreenshotPath(['click', '@s1:e1'], context.logPath)).toEqual([
            'click',
            '@s1:e1',
        ]);
    });
});
