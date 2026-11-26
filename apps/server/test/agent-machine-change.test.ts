import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    attachComputer,
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    invocationRequest,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import { closeFlush, nextAfter, settledTurn } from './agent-machine.fixture.ts';
import { openCaptainChat } from './captain-chat.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

const laptopId = `cmp_${'l'.repeat(16)}`;
let setup: InvocationHarness;
let runner: RunnerClient;
let mini: FrameClient;
let laptop: FrameClient;
let laptopCredential: string;
let busyRunId: string;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'machine-change' });
    mini = await connectComputer(setup.harness, setup.computerCredential);
    laptopCredential = await attachComputer(setup, { id: laptopId, name: 'MacBook' });
    laptop = await connectComputer(setup.harness, laptopCredential);
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    const greeting = await runner.next(frameOfType('runner-start'));
    const greetingRunId = (greeting.start as { runId: string }).runId;
    runner.send({ agentId: setup.agentId, runId: greetingRunId, type: 'ack' });
    runner.send(settledTurn(setup.agentId, greetingRunId));
    await mini.next((frame) => frame.type === 'drive-push' && frame.runId === greetingRunId);
});

afterAll(async () => {
    runner?.close();
    mini?.close();
    laptop?.close();
    await setup?.close();
});

test('an idle Agent flushes the old Machine, then switches once that push closes', async () => {
    const { agentId, owner, serverId } = setup;
    const flushed = nextAfter(mini, (frame) => frame.type === 'drive-flush');
    const configured = nextAfter(
        laptop,
        (frame) => frame.type === 'agent-configure' && frame.agentId === agentId
    );

    const requested = await owner.trpc.agent.setMachine.mutate({
        agentId,
        computerId: laptopId,
        fromLastSynced: true,
        serverId,
    });

    expect(requested).toMatchObject({
        change: { computerId: laptopId, fromLastSynced: false, waitingFor: 'drive' },
        computerId: setup.computerId,
    });
    const flush = await flushed;
    expect(flush).toMatchObject({ agentId, placementGeneration: 0, type: 'drive-flush' });
    expect(await closeFlush(setup, setup.computerCredential, flush.flushId as string)).toBe(200);

    expect(await owner.trpc.agent.machine.query({ agentId, serverId })).toEqual({
        agentId,
        change: null,
        computerId: laptopId,
    });
    await configured;
    expect(await placement()).toBe(1);
    expect(await closeFlush(setup, setup.computerCredential, flush.flushId as string)).toBe(403);
});

test('a change asked for mid-turn waits for the turn, then the old Machine pushes and flushes', async () => {
    const { agentId, owner, serverId } = setup;
    const chatId = (await openCaptainChat(owner, { agentId, serverId })).id;
    const pulled = nextAfter(laptop, (frame) => frame.type === 'drive-pull');
    const started = nextAfter(runner, (frame) => frame.type === 'runner-start');
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Check the notes.',
        nonce: 'busy_1',
        serverId,
    });
    const start = await started;
    busyRunId = (start.start as { runId: string }).runId;
    expect(await pulled).toMatchObject({ placementGeneration: 1, runId: busyRunId });

    const requested = await owner.trpc.agent.setMachine.mutate({
        agentId,
        computerId: setup.computerId,
        fromLastSynced: false,
        serverId,
    });
    expect(requested.change).toMatchObject({ computerId: setup.computerId, waitingFor: 'turn' });
    expect(laptop.frames.some((frame) => frame.type === 'drive-flush')).toBe(false);

    const pushed = nextAfter(laptop, (frame) => frame.type === 'drive-push');
    const flushed = nextAfter(laptop, (frame) => frame.type === 'drive-flush');
    runner.send({ agentId, runId: busyRunId, type: 'ack' });
    runner.send(settledTurn(agentId, busyRunId));
    const push = await pushed;
    const flush = await flushed;
    expect(push).toMatchObject({ placementGeneration: 1, runId: busyRunId });
    expect(flush).toMatchObject({ placementGeneration: 1 });
    expect(laptop.frames.indexOf(push)).toBeLessThan(laptop.frames.indexOf(flush));

    const heldFrom = runner.frames.length;
    await owner.trpc.chat.send.mutate({ chatId, content: 'Held?', nonce: 'busy_2', serverId });
    expect(await owner.trpc.agent.machine.query({ agentId, serverId })).toMatchObject({
        change: { waitingFor: 'drive' },
        computerId: laptopId,
    });
    expect(startsSince(heldFrom)).toEqual([]);

    const pulledBack = nextAfter(mini, (frame) => frame.type === 'drive-pull');
    expect(await closeFlush(setup, laptopCredential, flush.flushId as string)).toBe(200);
    expect(await placement()).toBe(2);
    expect(await pulledBack).toMatchObject({ placementGeneration: 2 });
});

test('a call that names no Computer, from a run started before the change, is refused moved', async () => {
    const { agentId } = setup;
    runner.send(invocationRequest(agentId, busyRunId, 'tool_after_move'));

    const answer = await runner.next(
        frameOfType('invocation-result', { toolCallId: 'tool_after_move' })
    );
    expect((answer.output as { text: string }).text).toStartWith(
        `Your Machine is now ${setup.computerId}, and this run started before that`
    );
    expect(
        await setup.harness.sql`
            select computer_id, refusal from agent_invocations where tool_call_id = 'tool_after_move'
        `
    ).toEqual([{ computer_id: setup.computerId, refusal: 'moved' }]);
});

test('naming the current Machine cancels a pending change', async () => {
    const { agentId, owner, serverId } = setup;
    const start = await runner.next(
        (frame) =>
            frame.type === 'runner-start' && (frame.start as { runId: string }).runId !== busyRunId
    );
    const runId = (start.start as { runId: string }).runId;
    await owner.trpc.agent.setMachine.mutate({
        agentId,
        computerId: laptopId,
        fromLastSynced: false,
        serverId,
    });

    const cancelled = await owner.trpc.agent.setMachine.mutate({
        agentId,
        computerId: setup.computerId,
        fromLastSynced: false,
        serverId,
    });

    expect(cancelled).toEqual({ agentId, change: null, computerId: setup.computerId });
    runner.send({ agentId, runId, type: 'ack' });
    runner.send(settledTurn(agentId, runId));
    expect(await placement()).toBe(2);
});

function startsSince(index: number) {
    return runner.frames.slice(index).filter((frame) => frame.type === 'runner-start');
}

async function placement() {
    const [row] = await setup.harness.sql`
        select placement_generation from agents where id = ${setup.agentId}
    `;
    return (row as { placement_generation: number }).placement_generation;
}
