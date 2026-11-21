import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import type { HausClient } from './haus-client.ts';
import { addMember } from './model-connection.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

let setup: InvocationHarness;
let runner: RunnerClient;
let computer: FrameClient;
let member: HausClient;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'computer-use-safety' });
    await setup.harness.sql`
        update computers set reported_inventory = reported_inventory || '{"name":"Studio"}'::jsonb
        where id = ${setup.computerId}
    `;
    member = await addMember(setup.harness, setup, 'user_computer_use_safety_member');
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    computer = await connectComputer(setup.harness, setup.computerCredential);
    await setup.owner.trpc.computer.setComputerUse.mutate({
        computerId: setup.computerId,
        enabled: true,
        serverId: setup.serverId,
    });
});

afterAll(async () => {
    runner?.close();
    computer?.close();
    member?.close();
    await setup?.close();
});

test('a locked screen the Computer reports reads as a refusal that names who can unlock it', async () => {
    desktop('run_locked', 'toolu_locked', ['snapshot']);
    const invoke = await computer.next(frameOfType('invoke', { runId: 'run_locked' }));
    computer.send({
        invocationId: invoke.invocationId,
        outcome: 'failed',
        output: { kind: 'text', text: "This Mac's screen is locked." },
        refusal: 'locked',
        truncated: false,
        type: 'invoke-result',
    });
    expect((await answerFor('toolu_locked')).output).toEqual({
        kind: 'text',
        text: "Studio's screen is locked; no computer use runs on a locked Mac. Ask @ada to unlock it. Ask once in plain text where you're working, link that page, and ask them to reply when it’s done. Then stop. When they reply, try again.",
    });
    expect(await ledger('run_locked')).toEqual([
        { outcome: 'failed', refusal: 'locked', state: 'finished' },
    ]);
});

test('Stop Agent Input cancels the running desktop command and tells the Captain why', async () => {
    const device = { computerId: setup.computerId, serverId: setup.serverId };
    desktop('run_stop', 'toolu_stop', ['drag', '@s1:e1', '@s1:e2']);
    const invoke = await computer.next(frameOfType('invoke', { runId: 'run_stop' }));
    expect(await member.trpc.computer.desktopActivity.query(device)).toMatchObject({
        commands: [{ agentId: setup.agentId, invocationId: invoke.invocationId }],
    });

    expect(await member.trpc.computer.stopDesktopInput.mutate(device)).toEqual({ stopped: 1 });
    await computer.next(frameOfType('invoke-cancel', { invocationId: invoke.invocationId }));
    computer.send({
        invocationId: invoke.invocationId,
        outcome: 'cancelled',
        output: { kind: 'text', text: '' },
        truncated: false,
        type: 'invoke-result',
    });
    expect(await answerFor('toolu_stop')).toMatchObject({
        outcome: 'cancelled',
        output: {
            kind: 'text',
            text: 'A person stopped agent input on Studio from Haus, so this command was cancelled. Stop using `desktop` there and tell the person what you were doing.',
        },
    });
    expect(await member.trpc.computer.desktopActivity.query(device)).toEqual({ commands: [] });
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

async function ledger(runId: string) {
    return await setup.harness.sql`
        select state, outcome, refusal from agent_invocations
        where run_id = ${runId} order by requested_at
    `;
}
