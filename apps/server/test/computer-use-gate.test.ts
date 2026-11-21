import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    invocationRequest,
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

const off =
    'Computer use is off on Studio. A person can turn on Computer use allowed in Settings → Devices → Studio.';

let setup: InvocationHarness;
let runner: RunnerClient;
let computer: FrameClient;
let member: HausClient;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'computer-use-gate' });
    await setup.harness.sql`
        update computers set reported_inventory = reported_inventory || '{"name":"Studio"}'::jsonb
        where id = ${setup.computerId}
    `;
    member = await addMember(setup.harness, setup, 'user_computer_use_member');
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    computer = await connectComputer(setup.harness, setup.computerCredential);
});

afterAll(async () => {
    runner?.close();
    computer?.close();
    member?.close();
    await setup?.close();
});

test('Computer use is off by default, and desktop looks and acts are refused without reaching the Computer', async () => {
    const listed = await setup.owner.trpc.computer.list.query({ serverId: setup.serverId });
    expect(listed[0]).toMatchObject({ canChangeComputerUse: true, computerUseEnabled: false });

    desktop('run_off', 'toolu_look', ['snapshot', '--app', 'Finder', '-i']);
    expect(await answerFor('toolu_look')).toMatchObject({
        outcome: 'failed',
        output: { kind: 'text', text: off },
    });
    desktop('run_off', 'toolu_act', ['click', '@s1:e8']);
    expect(await answerFor('toolu_act')).toMatchObject({
        outcome: 'failed',
        output: { kind: 'text', text: off },
    });
    expect(computer.frames.filter((frame) => frame.runId === 'run_off')).toEqual([]);
    expect(await invocationOutcomes('run_off')).toEqual([
        { outcome: 'failed', state: 'finished' },
        { outcome: 'failed', state: 'finished' },
    ]);
});

test('other invocations are sent to the Computer while Computer use is off', async () => {
    runner.send(invocationRequest(setup.agentId, 'run_other', 'toolu_other'));
    expect(await computer.next(frameOfType('invoke', { runId: 'run_other' }))).toMatchObject({
        runId: 'run_other',
    });
});

test('a member who is not a steward cannot turn Computer use on', async () => {
    await expect(
        member.trpc.computer.setComputerUse.mutate({
            computerId: setup.computerId,
            enabled: true,
            serverId: setup.serverId,
        })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    const listed = await setup.owner.trpc.computer.list.query({ serverId: setup.serverId });
    expect(listed[0]).toMatchObject({ computerUseEnabled: false });
});

test('once a steward turns Computer use on, a desktop act is sent to the Computer', async () => {
    await setup.owner.trpc.computer.setComputerUse.mutate({
        computerId: setup.computerId,
        enabled: true,
        serverId: setup.serverId,
    });
    const listed = await setup.owner.trpc.computer.list.query({ serverId: setup.serverId });
    expect(listed[0]).toMatchObject({ computerUseEnabled: true });

    desktop('run_on', 'toolu_on', ['press', 'cmd+c']);
    expect(await computer.next(frameOfType('invoke', { runId: 'run_on' }))).toMatchObject({
        operation: { args: ['press', 'cmd+c'], kind: 'desktop' },
    });
});

test('an unaccepted desktop act is not resent after Computer use is turned off', async () => {
    desktop('run_resend', 'toolu_resend', ['type', '@s1:e2', 'hello']);
    await computer.next(frameOfType('invoke', { runId: 'run_resend' }));
    computer.close();
    await computer.closed;
    await setup.owner.trpc.computer.setComputerUse.mutate({
        computerId: setup.computerId,
        enabled: false,
        serverId: setup.serverId,
    });

    computer = await connectComputer(setup.harness, setup.computerCredential);

    expect(await answerFor('toolu_resend')).toMatchObject({
        outcome: 'failed',
        output: { kind: 'text', text: off },
    });
    const [record] = await setup.harness.sql`
        select id, state, outcome from agent_invocations where run_id = 'run_resend'
    `;
    expect(record).toMatchObject({ outcome: 'failed', state: 'finished' });
    expect(
        await computer.next(frameOfType('invoke-cancel', { invocationId: record?.id }))
    ).toMatchObject({ invocationId: record?.id });
    expect(
        computer.frames.filter((frame) => frame.type === 'invoke' && frame.runId === 'run_resend')
    ).toEqual([]);
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

async function invocationOutcomes(runId: string) {
    return await setup.harness.sql`
        select state, outcome from agent_invocations where run_id = ${runId}
    `;
}
