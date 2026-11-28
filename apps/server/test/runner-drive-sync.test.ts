import { afterAll, beforeAll, expect, test } from 'bun:test';
import { ensureCaptainsProject } from './agent-home.fixture.ts';
import {
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import { openCaptainChat } from './captain-chat.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    type RunnerFrame,
    testRunnerToken,
} from './runner.fixture.ts';

let setup: InvocationHarness;
let runner: RunnerClient;
let computer: FrameClient;
let activeRunId: string;

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
    const chatId = (await openCaptainChat(owner, { agentId: setup.agentId, serverId })).id;
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'What is in your notes?',
        nonce: 'drive_sync_dm',
        serverId,
    });

    const start = await runner.next(frameOfType('runner-start'));
    expect(start.sessionResetKind).toBe('session');
    const { runId, sessionGeneration } = start.start as {
        runId: string;
        sessionGeneration: number;
    };
    const pull = await computer.next((frame) => frame.type === 'drive-pull');
    expect(pull).toEqual({
        agentId: setup.agentId,
        placementGeneration: 0,
        runId,
        sessionGeneration,
        type: 'drive-pull',
    });

    runner.send({ agentId: setup.agentId, runId, type: 'ack' });
    runner.send(settledTurn('run_stale'));
    runner.send(settledTurn(runId));
    const push = await computer.next((frame) => frame.type === 'drive-push');
    expect(push).toEqual({
        agentId: setup.agentId,
        placementGeneration: 0,
        runId,
        sessionGeneration,
        type: 'drive-push',
    });
});

test('after a full reset the next runner start carries the new generation and its reset kind', async () => {
    const { owner, serverId } = setup;
    await owner.trpc.agent.reset.mutate({ agentId: setup.agentId, kind: 'full', serverId });
    const reset = await runner.next(frameOfType('agent-reset'));
    const chatId = (await openCaptainChat(owner, { agentId: setup.agentId, serverId })).id;
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Start fresh.',
        nonce: 'drive_sync_after_reset',
        serverId,
    });

    const start = await runner.next(
        (frame) =>
            frame.type === 'runner-start' &&
            (frame.start as { sessionGeneration: number }).sessionGeneration ===
                reset.sessionGeneration
    );
    expect(start.sessionResetKind).toBe('full');
    activeRunId = (start.start as { runId: string }).runId;
});

test('a Computer that reconnects during a runner run pulls the Agent folder and leaves its push to the settle', async () => {
    computer.close();
    computer = await connectComputer(setup.harness, setup.computerCredential);

    const pull = await computer.next((frame) => frame.type === 'drive-pull');
    expect(pull).toMatchObject({ agentId: setup.agentId, runId: activeRunId });
    expect(computer.frames.some((frame) => frame.type === 'drive-push')).toBe(false);
});

test('a Computer that reconnects after the run settled pushes the folder for that last run', async () => {
    runner.send({ agentId: setup.agentId, runId: activeRunId, type: 'ack' });
    runner.send(settledTurn(activeRunId));
    await computer.next((frame) => frame.type === 'drive-push' && frame.runId === activeRunId);
    computer.close();
    computer = await connectComputer(setup.harness, setup.computerCredential);

    const push = await computer.next((frame) => frame.type === 'drive-push');
    expect(push).toMatchObject({ agentId: setup.agentId, runId: activeRunId });
    await computer.next((frame) => frame.type === 'bootstrap-accepted');
    expect(computer.frames.some((frame) => frame.type === 'drive-pull')).toBe(false);
});

test('a Task agent run on the same Machine sends no Drive frames while its Captain still syncs', async () => {
    const { owner, serverId } = setup;
    const { task } = await owner.trpc.task.start.mutate({
        computerId: setup.computerId,
        model: 'gpt-5.6-sol',
        projectId: await ensureCaptainsProject(owner, serverId),
        prompt: 'Run haus --version and date.',
        requestId: 'req-task-drive-sync',
        serverId,
    });
    const taskRunId = runIdOf(await runner.next(startFor(task.agentId)));
    const earlier = new Set(runner.frames.filter(startFor(setup.agentId)).map(runIdOf));
    const chatId = (await openCaptainChat(owner, { agentId: setup.agentId, serverId })).id;
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'And you?',
        nonce: 'drive_sync_beside_task',
        serverId,
    });
    const captainRunId = runIdOf(
        await runner.next((frame) => startFor(setup.agentId)(frame) && !earlier.has(runIdOf(frame)))
    );
    await computer.next(frameOfType('drive-pull', { runId: captainRunId }));

    runner.send({ agentId: task.agentId, runId: taskRunId, type: 'ack' });
    runner.send(settledTurn(taskRunId, task.agentId));
    runner.send({ agentId: setup.agentId, runId: captainRunId, type: 'ack' });
    runner.send(settledTurn(captainRunId));
    await computer.next(frameOfType('drive-push', { runId: captainRunId }));

    expect(
        computer.frames.filter(
            (frame) => frame.agentId === task.agentId && String(frame.type).startsWith('drive-')
        )
    ).toEqual([]);
});

function startFor(agentId: string) {
    return (frame: RunnerFrame) =>
        frame.type === 'runner-start' && (frame.start as { agentId: string }).agentId === agentId;
}

function runIdOf(frame: RunnerFrame) {
    return (frame.start as { runId: string }).runId;
}

function settledTurn(runId: string, agentId = setup.agentId) {
    const now = new Date().toISOString();
    return {
        activity: { operations: [] },
        agentId,
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
