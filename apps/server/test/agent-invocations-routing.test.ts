import { afterAll, beforeAll, expect, test } from 'bun:test';
import { publishAgentLifecycle } from '../src/agent-delivery/lifecycle.ts';
import {
    connectComputer,
    type FrameClient,
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

const timers = manualInvocationClock();
let setup: InvocationHarness;
let runner: RunnerClient;
let computer: FrameClient;

beforeAll(async () => {
    setup = await startInvocationHarness({ clock: timers.clock, slug: 'invocations-routing' });
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    computer = await connectComputer(setup.harness, setup.computerCredential);
});

afterAll(async () => {
    runner?.close();
    computer?.close();
    await setup?.close();
});

test('an invocation is sent with its clamped timeout, answered, acknowledged, and never sent twice', async () => {
    runner.send({
        ...invocationRequest(setup.agentId, 'run_happy', 'toolu_happy'),
        timeoutMs: 600_000,
    });
    const invoke = await computer.next(frameOfType('invoke'));
    const invocationId = String(invoke.invocationId);
    expect(invoke).toEqual({
        agentId: setup.agentId,
        invocationId,
        operation: { command: 'ls drive', kind: 'bash' },
        runId: 'run_happy',
        timeoutMs: 600_000,
        type: 'invoke',
    });

    computer.send({ invocationId, type: 'invoke-accepted' });
    computer.send({
        exitCode: 2,
        invocationId,
        logPath: `agents/${setup.agentId}/runtime/invocations/${invocationId}.log`,
        outcome: 'completed',
        output: { kind: 'text', text: 'ls: drive: No such file' },
        truncated: false,
        type: 'invoke-result',
    });

    expect(
        await runner.next(frameOfType('invocation-result', { toolCallId: 'toolu_happy' }))
    ).toEqual({
        agentId: setup.agentId,
        exitCode: 2,
        invocationId,
        logPath: `agents/${setup.agentId}/runtime/invocations/${invocationId}.log`,
        outcome: 'completed',
        output: { kind: 'text', text: 'ls: drive: No such file' },
        runId: 'run_happy',
        seq: 0,
        toolCallId: 'toolu_happy',
        truncated: false,
        type: 'invocation-result',
    });
    expect(await computer.next(frameOfType('invoke-result-ack'))).toEqual({
        invocationId,
        type: 'invoke-result-ack',
    });

    runner.send(invocationRequest(setup.agentId, 'run_happy', 'toolu_happy'));
    const repeated = await runner.next(
        (frame) =>
            frame.type === 'invocation-result' &&
            runner.frames.filter((seen) => seen.toolCallId === 'toolu_happy').length === 2
    );
    expect(repeated).toMatchObject({ exitCode: 2, invocationId, outcome: 'completed' });
    expect(computer.frames.filter((frame) => frame.type === 'invoke')).toHaveLength(1);
    expect(
        await setup.harness.sql`
            select state, outcome, exit_code, timeout_ms, operation_kind, computer_id
            from agent_invocations where id = ${invocationId}
        `
    ).toEqual([
        {
            computer_id: setup.computerId,
            exit_code: 2,
            operation_kind: 'bash',
            outcome: 'completed',
            state: 'finished',
            timeout_ms: 600_000,
        },
    ]);
});

test('a runner cancel reaches the Computer and its cancelled result reaches the runner', async () => {
    runner.send(invocationRequest(setup.agentId, 'run_cancel', 'toolu_cancel'));
    const invoke = await computer.next(frameOfType('invoke', { runId: 'run_cancel' }));
    const invocationId = String(invoke.invocationId);
    computer.send({ invocationId, type: 'invoke-accepted' });

    runner.send({
        agentId: setup.agentId,
        runId: 'run_cancel',
        seq: 0,
        toolCallId: 'toolu_cancel',
        type: 'invocation-cancel',
    });

    expect(await computer.next(frameOfType('invoke-cancel'))).toEqual({
        invocationId,
        type: 'invoke-cancel',
    });
    computer.send({
        invocationId,
        outcome: 'cancelled',
        output: { kind: 'text', text: 'partial' },
        truncated: false,
        type: 'invoke-result',
    });
    expect(
        await runner.next(frameOfType('invocation-result', { toolCallId: 'toolu_cancel' }))
    ).toMatchObject({ invocationId, outcome: 'cancelled' });
});

test('a reconnecting Computer gets every unacknowledged invoke again, and a cancel for a settled run', async () => {
    runner.send(invocationRequest(setup.agentId, 'run_resend', 'toolu_resend'));
    runner.send(invocationRequest(setup.agentId, 'run_settled', 'toolu_settled'));
    const resend = await computer.next(frameOfType('invoke', { runId: 'run_resend' }));
    const settled = await computer.next(frameOfType('invoke', { runId: 'run_settled' }));
    computer.send({ invocationId: settled.invocationId, type: 'invoke-accepted' });
    expect(timers.live()).toEqual([150_000, 150_000]);

    computer.close();
    await computer.closed;
    publishAgentLifecycle({
        agentId: setup.agentId,
        chatId: null,
        outcome: 'completed',
        phase: 'settled',
        runId: 'run_settled',
        serverId: setup.serverId,
    });

    computer = await connectComputer(setup.harness, setup.computerCredential);

    expect(await computer.next(frameOfType('invoke'))).toEqual(resend);
    expect(await computer.next(frameOfType('invoke-cancel'))).toEqual({
        invocationId: settled.invocationId,
        type: 'invoke-cancel',
    });
    expect(timers.live()).toEqual([150_000, 150_000]);
});
