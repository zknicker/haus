import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { ComputerUseRequestUpdatedEvent } from '@haus/api';
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

const awaiting =
    "This chat hasn't allowed computer use on Studio yet. Haus asked in the chat. End your turn; an inbox item tells you when someone answers. Looking at the screen needs no approval.";

let setup: InvocationHarness;
let runner: RunnerClient;
let computer: FrameClient;
let chatId = '';

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'computer-use-gate' });
    await setup.harness.sql`
        update computers set reported_inventory = reported_inventory || '{"name":"Studio"}'::jsonb
        where id = ${setup.computerId}
    `;
    const [chat] = (await setup.harness.sql`
        select id from chats where server_id = ${setup.serverId} and kind = 'channel'
        order by created_at limit 1
    `) as { id: string }[];
    chatId = chat?.id ?? '';
    await setup.harness.sql`
        insert into agent_run_triggers (server_id, agent_id, run_id, chat_id, source, work_id)
        values (${setup.serverId}, ${setup.agentId}, 'run_chat', ${chatId}, 'human', 'msg_gate')
    `;
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    computer = await connectComputer(setup.harness, setup.computerCredential);
});

afterAll(async () => {
    runner?.close();
    computer?.close();
    await setup?.close();
});

test('looking at the screen is sent to the Computer without asking', async () => {
    desktop('run_look', 'toolu_look', ['snapshot', '--app', 'Finder', '-i']);
    expect(await computer.next(frameOfType('invoke', { runId: 'run_look' }))).toMatchObject({
        operation: { args: ['snapshot', '--app', 'Finder', '-i'], kind: 'desktop' },
    });
});

test('an act with no chat to ask in is refused and records no request', async () => {
    desktop('run_nochat', 'toolu_nochat', ['click', '@s1:e8']);
    expect(await answerFor('toolu_nochat')).toMatchObject({
        outcome: 'failed',
        output: {
            kind: 'text',
            text: 'Computer use on Studio asks a person in a chat, and this turn has no chat to ask in.',
        },
    });
    expect(await requestRows()).toEqual([]);
    expect(await invocationOutcomes('run_nochat')).toEqual([
        { outcome: 'failed', state: 'finished' },
    ]);
});

test('an act asks the chat once, is refused until allowed, and is sent after', async () => {
    const events = await subscribeRequests();

    desktop('run_chat', 'toolu_first', ['click', '@s1:e8']);
    expect(await answerFor('toolu_first')).toMatchObject({
        outcome: 'failed',
        output: { kind: 'text', text: awaiting },
    });
    desktop('run_chat', 'toolu_second', ['type', '@s1:e9', 'hello']);
    expect(await answerFor('toolu_second')).toMatchObject({
        output: { kind: 'text', text: awaiting },
    });
    expect(await requestRows()).toEqual([
        { command: 'click', detail: '@s1:e8', state: 'requested' },
    ]);
    expect(computer.frames.filter((frame) => frame.runId === 'run_chat')).toEqual([]);

    const { requests } = await setup.owner.trpc.computerUse.requests.query({
        chatId,
        serverId: setup.serverId,
    });
    expect(requests).toEqual([
        expect.objectContaining({
            agentId: setup.agentId,
            canDecide: true,
            command: 'click',
            computerId: setup.computerId,
            computerName: 'Studio',
            decidedAt: null,
            detail: '@s1:e8',
            state: 'requested',
            waitingForName: 'Ada',
        }),
    ]);
    const requestId = requests[0]?.id ?? '';
    expect(await events.next()).toMatchObject({ chatId, requestId });

    await setup.owner.trpc.computerUse.decide.mutate({
        decision: 'allow',
        requestId,
        serverId: setup.serverId,
    });
    expect(await events.next()).toMatchObject({ chatId, requestId });
    await expect(
        setup.owner.trpc.computerUse.decide.mutate({
            decision: 'deny',
            requestId,
            serverId: setup.serverId,
        })
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
    expect(
        await setup.harness.sql`
            select chat_id, content from agent_inbox
            where agent_id = ${setup.agentId} and source = 'computer_use'
        `
    ).toEqual([
        {
            chat_id: chatId,
            content:
                'Ada allowed computer use on Studio in this chat. Next: run the desktop command again.',
        },
    ]);
    events.stop();

    desktop('run_chat', 'toolu_third', ['click', '@s1:e8']);
    expect(await computer.next(frameOfType('invoke', { runId: 'run_chat' }))).toMatchObject({
        operation: { args: ['click', '@s1:e8'], kind: 'desktop' },
    });
});

test('a Device set to always allow passes an act with no chat', async () => {
    await setup.owner.trpc.computer.setComputerUse.mutate({
        access: 'always',
        computerId: setup.computerId,
        serverId: setup.serverId,
    });
    const listed = await setup.owner.trpc.computer.list.query({ serverId: setup.serverId });
    expect(listed[0]).toMatchObject({ canChangeComputerUse: true, computerUseAccess: 'always' });

    desktop('run_always', 'toolu_always', ['press', 'cmd+c']);
    expect(await computer.next(frameOfType('invoke', { runId: 'run_always' }))).toMatchObject({
        operation: { args: ['press', 'cmd+c'], kind: 'desktop' },
    });
});

function desktop(runId: string, toolCallId: string, args: string[]) {
    runner.send({
        agentId: setup.agentId,
        operation: { args, kind: 'desktop' },
        runId,
        seq: 0,
        toolCallId,
        type: 'invocation-request',
    });
}

async function answerFor(toolCallId: string) {
    return await runner.next(frameOfType('invocation-result', { toolCallId }));
}

async function requestRows() {
    return await setup.harness.sql`
        select command, detail, state from computer_use_requests
        where server_id = ${setup.serverId} order by requested_at
    `;
}

async function invocationOutcomes(runId: string) {
    return await setup.harness.sql`
        select state, outcome from agent_invocations where run_id = ${runId}
    `;
}

async function subscribeRequests() {
    const received: ComputerUseRequestUpdatedEvent[] = [];
    const waiters: (() => void)[] = [];
    const started = Promise.withResolvers<void>();
    const subscription = setup.owner.trpc.computerUse.onRequestUpdated.subscribe(
        { chatId, serverId: setup.serverId },
        {
            onData: (event) => {
                received.push(event);
                for (const wake of waiters.splice(0)) {
                    wake();
                }
            },
            onError: (error) => started.reject(error),
            onStarted: () => started.resolve(),
        }
    );
    await started.promise;
    let cursor = 0;
    return {
        async next() {
            while (received.length <= cursor) {
                await new Promise<void>((resolve) => waiters.push(resolve));
            }
            cursor += 1;
            return received[cursor - 1];
        },
        stop: () => subscription.unsubscribe(),
    };
}
