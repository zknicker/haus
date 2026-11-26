import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    attachComputer,
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import { closeFlush, nextAfter, runnerBarrier, settledTurn } from './agent-machine.fixture.ts';
import { openCaptainChat } from './captain-chat.fixture.ts';
import { createHausClient } from './haus-client.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

const laptopId = `cmp_${'o'.repeat(16)}`;
let setup: InvocationHarness;
let runner: RunnerClient;
let mini: FrameClient | undefined;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'machine-offline' });
    await attachComputer(setup, { id: laptopId, name: 'MacBook' });
    runner = await attachRunner();
    const greeting = await runner.next(frameOfType('runner-start'));
    const runId = (greeting.start as { runId: string }).runId;
    runner.send({ agentId: setup.agentId, runId, type: 'ack' });
    runner.send(settledTurn(setup.agentId, runId));
    await runnerBarrier(runner, setup.agentId, 'barrier_greeting');
});

afterAll(async () => {
    runner?.close();
    mini?.close();
    await setup?.close();
});

test('a change from an offline Machine waits for it and holds no turns meanwhile', async () => {
    const { agentId, owner, serverId } = setup;

    const requested = await owner.trpc.agent.setMachine.mutate({
        agentId,
        computerId: laptopId,
        fromLastSynced: false,
        serverId,
    });

    expect(requested).toMatchObject({
        change: { computerId: laptopId, fromLastSynced: false, waitingFor: 'machine' },
        computerId: setup.computerId,
    });
    const chatId = (await openCaptainChat(owner, { agentId, serverId })).id;
    const started = nextAfter(runner, (frame) => frame.type === 'runner-start');
    await owner.trpc.chat.send.mutate({
        chatId,
        content: 'Still here?',
        nonce: 'offline_1',
        serverId,
    });
    const runId = ((await started).start as { runId: string }).runId;
    runner.send({ agentId, runId, type: 'ack' });
    runner.send(settledTurn(agentId, runId));
    await runnerBarrier(runner, agentId, 'barrier_offline_turn');
    expect((await owner.trpc.agent.machine.query({ agentId, serverId })).change).toMatchObject({
        waitingFor: 'machine',
    });
});

test('a turn admitted while the old Mac is offline voids its earlier flush, so a late close confirms nothing', async () => {
    const { agentId, owner, serverId } = setup;
    await setup.harness.sql`
        update agent_machine_changes set flush_id = 'flush_before_offline', flush_sent_at = now()
        where agent_id = ${agentId}
    `;
    const chatId = (await openCaptainChat(owner, { agentId, serverId })).id;
    const started = nextAfter(runner, (frame) => frame.type === 'runner-start');
    await owner.trpc.chat.send.mutate({ chatId, content: 'Again?', nonce: 'offline_2', serverId });
    const runId = ((await started).start as { runId: string }).runId;

    expect(await closeFlush(setup, setup.computerCredential, 'flush_before_offline')).toBe(404);
    expect(
        await setup.harness.sql`
            select flush_id, flushed_at from agent_machine_changes where agent_id = ${agentId}
        `
    ).toEqual([{ flush_id: null, flushed_at: null }]);
    runner.send({ agentId, runId, type: 'ack' });
    runner.send(settledTurn(agentId, runId));
    await runnerBarrier(runner, agentId, 'barrier_offline_turn_2');
    expect((await owner.trpc.agent.machine.query({ agentId, serverId })).change).toMatchObject({
        waitingFor: 'machine',
    });
});

test('a change survives a Server restart and applies once the old Machine reconnects and flushes', async () => {
    setup.owner.close();
    runner.close();
    await setup.harness.restart();
    setup.owner = createHausClient(
        setup.harness,
        await setup.harness.humans.mintSessionToken('user_machine-offline')
    );
    runner = await attachRunner();
    const { agentId, serverId } = setup;
    expect(
        (await setup.owner.trpc.agent.machine.query({ agentId, serverId })).change
    ).toMatchObject({ computerId: laptopId, waitingFor: 'machine' });

    mini = await connectComputer(setup.harness, setup.computerCredential);
    const flush = await mini.next((frame) => frame.type === 'drive-flush');
    expect(flush).toMatchObject({ agentId, placementGeneration: 0 });
    expect(await closeFlush(setup, setup.computerCredential, flush.flushId as string)).toBe(200);

    expect(await setup.owner.trpc.agent.machine.query({ agentId, serverId })).toEqual({
        agentId,
        change: null,
        computerId: laptopId,
    });
});

test('moving from the last synced revision leaves an offline Machine behind at once', async () => {
    const { agentId, serverId } = setup;
    const configured = nextAfter(
        mini as FrameClient,
        (frame) => frame.type === 'agent-configure' && frame.agentId === agentId
    );

    const moved = await setup.owner.trpc.agent.setMachine.mutate({
        agentId,
        computerId: setup.computerId,
        fromLastSynced: true,
        serverId,
    });

    expect(moved).toEqual({ agentId, change: null, computerId: setup.computerId });
    await configured;
    expect(
        await setup.harness.sql`select placement_generation from agents where id = ${agentId}`
    ).toEqual([{ placement_generation: 2 }]);
    expect(await closeFlush(setup, setup.computerCredential, 'flush_unknown')).toBe(404);
});

async function attachRunner() {
    const client = connectRunner(setup.harness, testRunnerToken);
    await client.next(frameOfType('runner-hello-accepted'));
    return client;
}
