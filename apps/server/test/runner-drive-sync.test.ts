import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

let setup: InvocationHarness;
let runner: RunnerClient;
let computer: FrameClient;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'runner-drive-sync' });
    computer = await connectComputer(setup.harness, setup.computerCredential);
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
});

afterAll(async () => {
    runner?.close();
    computer?.close();
    await setup?.close();
});

test('a runner run pulls the Agent drive folder on its machine when it starts and pushes it when it settles', async () => {
    const { owner, serverId } = setup;
    const chatId = (
        await owner.trpc.chat.ensureAgentDm.mutate({ agentId: setup.agentId, serverId })
    ).id;
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'What is in your notes?',
        nonce: 'drive_sync_dm',
        serverId,
    });

    const start = await runner.next(frameOfType('runner-start'));
    const { runId } = start.start as { runId: string };
    const pull = await computer.next((frame) => frame.type === 'drive-pull');
    expect(pull).toEqual({ agentId: setup.agentId, runId, type: 'drive-pull' });

    runner.send({ agentId: setup.agentId, runId, type: 'ack' });
    runner.send(settledTurn(runId));
    const push = await computer.next((frame) => frame.type === 'drive-push');
    expect(push).toEqual({ agentId: setup.agentId, runId, type: 'drive-push' });
});

function settledTurn(runId: string) {
    const now = new Date().toISOString();
    return {
        activity: { operations: [] },
        agentId: setup.agentId,
        endedAt: now,
        messageCount: 0,
        modelId: 'gpt-5.6-sol',
        outputProduced: false,
        runId,
        runtimeId: 'codex',
        startedAt: now,
        status: 'completed',
        summary: 'Read the notes.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}
