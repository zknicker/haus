import { afterEach, beforeEach, expect, test } from 'bun:test';
import { mkdir, mkdtemp, readdir, realpath, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { handlerInput } from './handler-host.test-support.ts';
import { createInvocationHandler } from './handler.ts';

const visitor = 'agt_visitorvisitorvi';

let root: string;
let agentsRoot: string;

beforeEach(async () => {
    root = await realpath(await mkdtemp(join(tmpdir(), 'haus-invocation-off-home-')));
    agentsRoot = join(root, 'servers', 'srv_1', 'agents');
    await mkdir(agentsRoot, { recursive: true });
});

afterEach(async () => {
    await rm(root, { force: true, recursive: true });
});

test('a call from an Agent with no folder here runs in its own workspace, with HOME beside it and no drive/', async () => {
    const frames: unknown[] = [];
    const handler = await createInvocationHandler(handlerInput(agentsRoot, frames));

    handler.receive({
        agentId: visitor,
        invocationId: 'inv-1',
        notAfter: '2999-01-01T00:00:00.000Z',
        operation: { command: 'pwd -P; printf "%s" "$HOME"', kind: 'bash' },
        runId: 'run-1',
        sessionGeneration: 1,
        timeoutMs: 30_000,
        type: 'invoke',
    });
    await handler.settled();

    const agentRoot = join(agentsRoot, visitor);
    expect(frames).toContainEqual(
        expect.objectContaining({
            exitCode: 0,
            invocationId: 'inv-1',
            outcome: 'completed',
            output: {
                kind: 'text',
                text: `${join(agentRoot, 'workspace')}\n${join(agentRoot, 'home')}`,
            },
            type: 'invoke-result',
        })
    );
    expect((await readdir(agentRoot)).sort()).toEqual(['home', 'runtime', 'workspace']);
});
