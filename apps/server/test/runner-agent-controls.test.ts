import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type InvocationHarness, startInvocationHarness } from './agent-invocations.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

let setup: InvocationHarness;
let runner: RunnerClient;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'runner-agent-controls' });
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
});

afterAll(async () => {
    runner?.close();
    await setup?.close();
});

test('restart reaches the runner while the Agent Computer is offline', async () => {
    await setup.owner.trpc.agent.restart.mutate({
        agentId: setup.agentId,
        serverId: setup.serverId,
    });

    expect(await runner.next(frameOfType('agent-restart'))).toEqual({
        agentId: setup.agentId,
        type: 'agent-restart',
    });
});

test('a session reset and a full reset reach the runner with the rotated generation', async () => {
    await setup.owner.trpc.agent.reset.mutate({
        agentId: setup.agentId,
        kind: 'session',
        serverId: setup.serverId,
    });
    const session = await runner.next(frameOfType('agent-reset'));
    expect(session).toMatchObject({ agentId: setup.agentId, kind: 'session', type: 'agent-reset' });

    await setup.owner.trpc.agent.reset.mutate({
        agentId: setup.agentId,
        kind: 'full',
        serverId: setup.serverId,
    });
    const full = await runner.next(
        (frame) => frame.type === 'agent-reset' && frame.kind === 'full'
    );
    expect(full.sessionGeneration).toBe(Number(session.sessionGeneration) + 1);
});
