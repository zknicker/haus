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
    expect(timers.live()).toEqual([35_000]);
    timers.advance(35_000);

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

test('a connected Computer that answers past the window leaves the invocation unknown, as the runner saw it', async () => {
    const computer = await connectComputer(setup.harness, setup.computerCredential);
    runner.send({
        ...invocationRequest(setup.agentId, 'run_slow', 'toolu_slow'),
        timeoutMs: 5000,
    });
    const invoke = await computer.next(frameOfType('invoke', { runId: 'run_slow' }));
    const invocationId = String(invoke.invocationId);
    computer.send({ invocationId, type: 'invoke-accepted' });

    expect(timers.live()).toEqual([35_000]);
    timers.advance(35_000);
    expect(
        await runner.next(frameOfType('invocation-result', { toolCallId: 'toolu_slow' }))
    ).toEqual({
        agentId: setup.agentId,
        invocationId,
        outcome: 'unknown',
        output: { kind: 'text', text: unknownText },
        runId: 'run_slow',
        seq: 0,
        toolCallId: 'toolu_slow',
        truncated: false,
        type: 'invocation-result',
    });

    computer.send({
        exitCode: 0,
        invocationId,
        outcome: 'completed',
        output: { kind: 'text', text: 'drive\n' },
        truncated: false,
        type: 'invoke-result',
    });
    expect(await computer.next(frameOfType('invoke-result-ack', { invocationId }))).toEqual({
        invocationId,
        type: 'invoke-result-ack',
    });

    runner.send(invocationRequest(setup.agentId, 'run_slow', 'toolu_slow'));
    await runner.next(
        (frame) =>
            frame.type === 'invocation-result' &&
            runner.frames.filter((seen) => seen.toolCallId === 'toolu_slow').length === 2
    );
    expect(
        runner.frames
            .filter((frame) => frame.toolCallId === 'toolu_slow')
            .map((frame) => frame.outcome)
    ).toEqual(['unknown', 'unknown']);
    expect(
        await setup.harness.sql`
            select state, outcome, late_outcome, late_exit_code
            from agent_invocations where id = ${invocationId}
        `
    ).toEqual([
        { late_exit_code: 0, late_outcome: 'completed', outcome: 'unknown', state: 'unknown' },
    ]);
    computer.close();
    await computer.closed;
});

test('a Computer that reconnects after the window that began at send gets no invoke again', async () => {
    const first = await connectComputer(setup.harness, setup.computerCredential);
    runner.send({
        ...invocationRequest(setup.agentId, 'run_late_return', 'toolu_late_return'),
        timeoutMs: 5000,
    });
    const invoke = await first.next(frameOfType('invoke', { runId: 'run_late_return' }));
    timers.advance(30_000);
    first.close();
    await first.closed;
    timers.advance(5000);

    const second = await connectComputer(setup.harness, setup.computerCredential);
    runner.send(invocationRequest(setup.agentId, 'run_after_return', 'toolu_after_return'));
    const next = await second.next(frameOfType('invoke', { runId: 'run_after_return' }));
    expect(second.frames.filter((frame) => frame.type === 'invoke')).toEqual([next]);
    expect(
        await runner.next(frameOfType('invocation-result', { toolCallId: 'toolu_late_return' }))
    ).toMatchObject({ invocationId: invoke.invocationId, outcome: 'unknown' });
    second.close();
    await second.closed;
});
