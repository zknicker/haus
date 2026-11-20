import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type InvocationHarness, startInvocationHarness } from './agent-invocations.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    reportRunnerModels,
    testRunnerRuntimes,
    testRunnerToken,
} from './runner.fixture.ts';

const runtimes = [
    {
        id: 'gemini',
        label: 'Gemini',
        models: [
            {
                contextWindow: 1_048_576,
                id: 'gemini-4-argon',
                label: 'Gemini 4 Argon',
                reasoningEfforts: ['low', 'medium', 'high'],
            },
        ],
    },
];

let setup: InvocationHarness;
let runner: RunnerClient | undefined;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'runner-model-catalog' });
});

afterAll(async () => {
    runner?.close();
    await setup?.close();
});

const configure = (modelId: string, reasoningEffort?: 'max') =>
    setup.owner.trpc.agent.configure.mutate({
        agentId: setup.agentId,
        modelId,
        ...(reasoningEffort ? { reasoningEffort } : {}),
        runtimeId: 'gemini',
        serverId: setup.serverId,
    });

test('on the runner loop an Agent model must be one the runner catalog offers', async () => {
    const list = () => setup.owner.trpc.modelConnections.list.query({ serverId: setup.serverId });
    expect((await list()).runnerModels).toEqual(testRunnerRuntimes);
    await expect(configure('gemini-4-argon')).rejects.toThrow(
        'Haus does not offer the model "gemini-4-argon" in "gemini".'
    );

    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    await reportRunnerModels(setup.harness, { attached: runner, runtimes });

    expect((await list()).runnerModels).toEqual(runtimes);
    await expect(configure('gemini-4-argon', 'max')).rejects.toThrow(
        'does not support reasoning effort "max"'
    );
    await configure('gemini-4-argon');
    const agent = await setup.owner.trpc.agent.get.query({
        agentId: setup.agentId,
        serverId: setup.serverId,
    });
    expect(agent).toMatchObject({ desiredModelId: 'gemini-4-argon', desiredRuntimeId: 'gemini' });
});
