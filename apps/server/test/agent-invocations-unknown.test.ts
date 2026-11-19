import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    connectComputer,
    type InvocationHarness,
    invocationRequest,
    manualInvocationClock,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

const unknownText =
    'The machine lost this command before it reported a result. It may or may not have run; check its effects before running it again.';
const timers = manualInvocationClock();
let setup: InvocationHarness;
let runner: RunnerClient;

beforeAll(async () => {
    setup = await startInvocationHarness({ clock: timers.clock, slug: 'invocations-unknown' });
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
});

afterAll(async () => {
    runner?.close();
    await setup?.close();
});

test('an invocation unknown past the grace is never sent again, and its late result is recorded without reaching the runner', async () => {
    const first = await connectComputer(setup.harness, setup.computerCredential);
    runner.send({
        ...invocationRequest(setup.agentId, 'run_lost', 'toolu_lost'),
        timeoutMs: 5000,
    });
    const invoke = await first.next(frameOfType('invoke'));
    const invocationId = String(invoke.invocationId);

    first.close();
    await first.closed;
    await timers.scheduledOnce();
    expect(timers.live()).toEqual([35_000]);
    timers.fireAll();

    expect(
        await runner.next(frameOfType('invocation-result', { toolCallId: 'toolu_lost' }))
    ).toEqual({
        agentId: setup.agentId,
        invocationId,
        outcome: 'unknown',
        output: { kind: 'text', text: unknownText },
        runId: 'run_lost',
        seq: 0,
        toolCallId: 'toolu_lost',
        truncated: false,
        type: 'invocation-result',
    });

    const second = await connectComputer(setup.harness, setup.computerCredential);
    second.send({ invocationId, type: 'invoke-accepted' });
    second.send({
        exitCode: 0,
        invocationId,
        outcome: 'completed',
        output: { kind: 'text', text: 'drive\n' },
        truncated: false,
        type: 'invoke-result',
    });
    expect(await second.next(frameOfType('invoke-result-ack'))).toEqual({
        invocationId,
        type: 'invoke-result-ack',
    });

    runner.send(invocationRequest(setup.agentId, 'run_lost', 'toolu_lost'));
    await runner.next(
        (frame) =>
            frame.type === 'invocation-result' &&
            runner.frames.filter((seen) => seen.toolCallId === 'toolu_lost').length === 2
    );
    expect(
        runner.frames
            .filter((frame) => frame.toolCallId === 'toolu_lost')
            .map((frame) => frame.outcome)
    ).toEqual(['unknown', 'unknown']);
    expect(second.frames.filter((frame) => frame.type === 'invoke')).toEqual([]);
    expect(
        await setup.harness.sql`
            select state, outcome, late_outcome, late_exit_code, accepted_at
            from agent_invocations where id = ${invocationId}
        `
    ).toEqual([
        {
            accepted_at: null,
            late_exit_code: 0,
            late_outcome: 'completed',
            outcome: 'unknown',
            state: 'unknown',
        },
    ]);
    second.close();
    await second.closed;
});
