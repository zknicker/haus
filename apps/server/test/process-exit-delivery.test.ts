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
    setup = await startInvocationHarness({ slug: 'process-exit-delivery' });
    await setup.harness.sql`
        update computers set reported_inventory = reported_inventory || '{"name":"Studio"}'::jsonb
        where id = ${setup.computerId}
    `;
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    computer = await connectComputer(setup.harness, setup.computerCredential);
    const greeting = await runner.next(frameOfType('runner-start'));
    runner.send(settledTurn(String((greeting.start as { runId: string }).runId)));
});

afterAll(async () => {
    runner?.close();
    computer?.close();
    await setup?.close();
});

test('a background process exit wakes its idle session once, and every report is acknowledged', async () => {
    const exit = {
        agentId: setup.agentId,
        cursor: 18,
        exitCode: 1,
        exitedAt: '2026-11-26T12:05:00.000Z',
        processId: 'prc_buildbuildbuildb',
        sessionGeneration: 1,
        startedAt: '2026-11-26T12:00:00.000Z',
        tail: 'error: tests fail\n',
        type: 'process-exit',
    };

    computer.send(exit);
    await computer.next(frameOfType('process-exit-ack', { processId: exit.processId }));
    const start = await runner.next(
        (frame) =>
            frame.type === 'runner-start' &&
            (frame.start as { processExit?: unknown }).processExit !== undefined
    );
    computer.send(exit);
    await computer.next(
        (frame) =>
            frame.type === 'process-exit-ack' &&
            computer.frames.filter((sent) => sent.type === 'process-exit-ack').length === 2
    );

    expect(start.start).toMatchObject({
        chatId: null,
        processExit: {
            computerName: 'Studio',
            cursor: 18,
            exitCode: 1,
            processId: 'prc_buildbuildbuildb',
            tail: 'error: tests fail\n',
        },
    });
    expect(
        await setup.harness.sql`
            select source, dedupe_key from agent_inbox
            where agent_id = ${setup.agentId} and source = 'process_exit'
        `
    ).toEqual([{ dedupe_key: 'process-exit:prc_buildbuildbuildb', source: 'process_exit' }]);
});

function settledTurn(runId: string) {
    const now = new Date().toISOString();
    return {
        activity: { operations: [] },
        agentId: setup.agentId,
        endedAt: now,
        messageCount: 1,
        modelId: 'gpt-5.6-sol',
        outputProduced: true,
        runId,
        runtimeId: 'codex',
        startedAt: now,
        status: 'completed',
        summary: 'Said hello.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}
