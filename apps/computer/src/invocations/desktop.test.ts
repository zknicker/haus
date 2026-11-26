import { describe, expect, test } from 'bun:test';
import { invokeResultSchema } from '@haus/api';
import { agentDesktopToolsRoot, computerUseLockPath } from '../desktop/agent-desktop-binary.ts';
import { withScreenshotPath } from '../desktop/desktop-command.ts';
import { refusalResult } from '../desktop/desktop-refusals.ts';
import { createDesktopRunner } from './desktop.ts';
import { inlinePayloads, textResult } from './operation.ts';
import { operationSession } from './operation-session.test-support.ts';

const context = {
    agentId: 'agent-1',
    cwd: '/workspace',
    env: {},
    invocationId: 'invocation-1',
    logPath: '/agents/agent-1/runtime/invocations/invocation-1.log',
    payloads: inlinePayloads,
    signal: new AbortController().signal,
    timeoutMs: 60_000,
    ...operationSession(),
};

function failed(text: string) {
    return textResult('failed', text);
}

describe('desktop invocations', () => {
    test('a Computer off macOS fails before resolving agent-desktop', async () => {
        const run = createDesktopRunner({ platform: 'linux', toolsRoot: '/no-tools' });
        expect(await run({ args: ['snapshot', '-i'], kind: 'desktop' }, context)).toEqual(
            failed('Computer use runs on macOS Devices.')
        );
    });

    test('a refused command fails without reaching agent-desktop', async () => {
        const run = createDesktopRunner({ platform: 'darwin', toolsRoot: '/no-tools' });
        expect(await run({ args: ['session', 'start'], kind: 'desktop' }, context)).toEqual(
            failed(
                'Use one agent-desktop command that looks at or acts on apps. Sessions, batches, traces, held keys, and identity flags are not allowed.'
            )
        );
    });

    test('a screen refusal fails with its reason in the invoke-result frame', () => {
        const result = refusalResult('locked');
        expect(result).toEqual({
            outcome: 'failed',
            output: {
                kind: 'text',
                text: "This Mac's screen is locked; no computer use runs on a locked Mac. Ask the person to unlock it.",
            },
            refusal: 'locked',
            truncated: false,
        });
        expect(
            invokeResultSchema.parse({
                ...result,
                invocationId: context.invocationId,
                type: 'invoke-result',
            }).refusal
        ).toBe('locked');
        expect(refusalResult('no-session').output).toEqual({
            kind: 'text',
            text: "Nobody is logged in on this Mac's screen; no computer use runs without a logged-in session. Ask the person to log in.",
        });
        expect(refusalResult('switched-out').refusal).toBe('switched-out');
    });

    test('the desktop lock sits in the data root above the agent-desktop tools', () => {
        expect(computerUseLockPath(agentDesktopToolsRoot('/data'))).toBe('/data/computer-use.lock');
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
