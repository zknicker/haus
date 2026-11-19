import { describe, expect, test } from 'bun:test';
import { createBrowserRunner } from './browser.ts';
import { inlinePayloads } from './operation.ts';

const context = {
    agentId: 'agent-1',
    cwd: '/workspace',
    env: {},
    invocationId: 'invocation-1',
    logPath: '/workspace/invocation-1.log',
    payloads: inlinePayloads,
    signal: new AbortController().signal,
    timeoutMs: 60_000,
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
});
