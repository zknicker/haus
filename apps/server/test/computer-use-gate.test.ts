import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    invocationRequest,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import type { HausClient } from './haus-client.ts';
import { harnessAppOrigin } from './haus-server-harness.ts';
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
let link: string;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'computer-use-gate' });
    await setup.harness.sql`
        update computers set reported_inventory = reported_inventory || '{"name":"Studio"}'::jsonb
        where id = ${setup.computerId}
    `;
    link = `${harnessAppOrigin}/s/computer-use-gate/settings/computers/${setup.computerId}#access`;
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

test('Computer use is off by default, and a refused Captain is told who can turn it on, then to stop', async () => {
    const listed = await setup.owner.trpc.computer.list.query({ serverId: setup.serverId });
    expect(listed[0]).toMatchObject({
        canChangeComputerUse: true,
        canEnableComputerUse: true,
        computerUseChangedAt: null,
        computerUseEnabled: false,
    });

    const first = await refusedText('run_off', 'toolu_look', ['snapshot', '--app', 'Finder']);
    expect(first).toBe(
        `Computer use is off on Studio and has never been turned on. Only @ada can turn it on, in Settings → Devices → Studio (${link}). Ask once in plain text where you're working, link that page, and ask them to reply when it’s changed. Then stop. When they reply, try again.`
    );
    expect(await refusedText('run_off', 'toolu_act', ['click', '@s1:e8'])).toEndWith(
        'Already refused this turn. Stop calling `desktop`.'
    );
    expect(computer.frames.filter((frame) => frame.runId === 'run_off')).toEqual([]);
    expect(await ledger('run_off')).toEqual([
        { outcome: 'failed', refusal: 'off', state: 'finished' },
        { outcome: 'failed', refusal: 'off', state: 'finished' },
    ]);

    expect(await refusedText('run_off_later', 'toolu_later', ['snapshot'])).toMatch(
        /You were already refused for this on Studio at \d\d:\d\d UTC on \d{4}-\d\d-\d\d and asked then\. Don't ask again; wait for a reply\.$/u
    );
});

test('other invocations are sent to the Computer while Computer use is off', async () => {
    runner.send(invocationRequest(setup.agentId, 'run_other', 'toolu_other'));
    expect(await computer.next(frameOfType('invoke', { runId: 'run_other' }))).toMatchObject({
        runId: 'run_other',
    });
});

test('a member who is not a steward cannot change computer use, but can see who can', async () => {
    const device = { computerId: setup.computerId, serverId: setup.serverId };
    await expect(
        member.trpc.computer.setComputerUse.mutate({ ...device, enabled: true })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    await expect(
        member.trpc.computer.setAgentAccessScope.mutate({ ...device, scope: 'all' })
    ).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
    expect(await member.trpc.computer.stewards.query(device)).toEqual({
        attacher: { displayName: 'Ada', handle: 'ada' },
        name: 'Studio',
    });
});

test('once a steward turns Computer use on, a desktop act is sent to the Computer', async () => {
    await setEnabled(true);
    const listed = await setup.owner.trpc.computer.list.query({ serverId: setup.serverId });
    expect(listed[0]?.computerUseEnabled).toBe(true);
    expect(listed[0]?.computerUseChangedAt).not.toBeNull();

    desktop('run_on', 'toolu_on', ['press', 'cmd+c']);
    const invoke = await computer.next(frameOfType('invoke', { runId: 'run_on' }));
    expect(invoke).toMatchObject({ operation: { args: ['press', 'cmd+c'], kind: 'desktop' } });
    await finish(invoke, 'toolu_on');
});

test('a Device whose macOS permissions are missing names the pane for its macOS version', async () => {
    await setReadiness({
        accessibility: 'denied',
        macosVersion: '27.3',
        screenRecording: 'granted',
    });
    expect(await refusedText('run_ready', 'toolu_ready', ['snapshot'])).toStartWith(
        `macOS hasn't given Haus Computer System & App Protection Override on Studio yet. @ada can allow it in System Settings → Privacy & Security on that Mac; the steps are in Settings → Devices → Studio (${link}).`
    );
    await setReadiness({
        accessibility: 'granted',
        macosVersion: '27.3',
        screenRecording: 'granted',
    });
});

test('a Captain whose Machine is elsewhere is refused no-access until Studio allows All Captains', async () => {
    const elsewhere = 'cmp_computerusegateb';
    await setup.harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, health)
        select ${elsewhere}, server_id, attached_by_user_id, repeat('b', 64), 'offline'
        from computers where id = ${setup.computerId}
    `;
    await setup.harness
        .sql`update agents set computer_id = ${elsewhere} where id = ${setup.agentId}`;
    desktop('run_moved', 'toolu_moved', ['snapshot'], setup.computerId);
    expect(textOf(await answerFor('toolu_moved'))).toStartWith(
        `You don't have access to Studio. Only @ada can give you access, in Settings → Devices → Studio (${link}).`
    );

    await setScope('all');
    desktop('run_everyone', 'toolu_everyone', ['snapshot'], setup.computerId);
    await finish(
        await computer.next(frameOfType('invoke', { runId: 'run_everyone' })),
        'toolu_everyone'
    );

    await setScope('selected');
    await setup.harness
        .sql`update agents set computer_id = ${setup.computerId} where id = ${setup.agentId}`;
});

test('an unaccepted desktop act is not resent after Computer use is turned off', async () => {
    desktop('run_resend', 'toolu_resend', ['type', '@s1:e2', 'hello']);
    await computer.next(frameOfType('invoke', { runId: 'run_resend' }));
    computer.close();
    await computer.closed;
    await setEnabled(false);

    computer = await connectComputer(setup.harness, setup.computerCredential);

    const answer = await answerFor('toolu_resend');
    expect(answer).toMatchObject({ outcome: 'failed' });
    expect(textOf(answer)).toMatch(
        /^Computer use is off on Studio \(since \d{4}-\d\d-\d\d\)\. Only @ada can turn it on/u
    );
    const [record] = await setup.harness.sql`
        select id, state, outcome, refusal from agent_invocations where run_id = 'run_resend'
    `;
    expect(record).toMatchObject({ outcome: 'failed', refusal: 'off', state: 'finished' });
    expect(
        await computer.next(frameOfType('invoke-cancel', { invocationId: record?.id }))
    ).toMatchObject({ invocationId: record?.id });
    expect(
        computer.frames.filter((frame) => frame.type === 'invoke' && frame.runId === 'run_resend')
    ).toEqual([]);
});

test('an offline Device answers offline with who can bring it back', async () => {
    await setEnabled(true);
    computer.close();
    await computer.closed;
    desktop('run_offline', 'toolu_offline', ['snapshot']);
    const answer = await answerFor('toolu_offline');
    expect(answer).toMatchObject({ outcome: 'offline' });
    expect(textOf(answer)).toStartWith(
        `Studio is offline, so computer use can't run there. Ask @ada to wake that Mac and check that Haus Computer is running; Settings → Devices → Studio (${link}) shows when it's back.`
    );
    expect(await ledger('run_offline')).toEqual([
        { outcome: 'offline', refusal: 'offline', state: 'finished' },
    ]);
    computer = await connectComputer(setup.harness, setup.computerCredential);
});

async function finish(invoke: Record<string, unknown>, toolCallId: string) {
    computer.send({
        invocationId: invoke.invocationId,
        outcome: 'completed',
        output: { kind: 'text', text: 'ok' },
        truncated: false,
        type: 'invoke-result',
    });
    await answerFor(toolCallId);
}

function desktop(runId: string, toolCallId: string, args: string[], target?: string) {
    runner.send({
        agentId: setup.agentId,
        ...(target ? { computer: target } : {}),
        operation: { args, kind: 'desktop' },
        runId,
        seq: 0,
        toolCallId,
        type: 'invocation-request',
    });
}

async function refusedText(runId: string, toolCallId: string, args: string[]) {
    desktop(runId, toolCallId, args);
    const answer = await answerFor(toolCallId);
    expect(answer).toMatchObject({ outcome: 'failed' });
    return textOf(answer);
}

function textOf(answer: Record<string, unknown>) {
    const output = answer.output as { text: string };
    return output.text;
}

async function answerFor(toolCallId: string) {
    return await runner.next(frameOfType('invocation-result', { toolCallId }));
}

async function setEnabled(enabled: boolean) {
    await setup.owner.trpc.computer.setComputerUse.mutate({
        computerId: setup.computerId,
        enabled,
        serverId: setup.serverId,
    });
}

async function setScope(scope: 'all' | 'selected') {
    await setup.owner.trpc.computer.setAgentAccessScope.mutate({
        computerId: setup.computerId,
        scope,
        serverId: setup.serverId,
    });
}

async function setReadiness(permissions: Record<string, string>) {
    const computerUse = { installed: true, version: '1.3.1', ...permissions };
    await setup.harness.sql`
        update computers
        set reported_inventory = reported_inventory || jsonb_build_object('computerUse', ${computerUse}::jsonb)
        where id = ${setup.computerId}
    `;
}

async function ledger(runId: string) {
    return await setup.harness.sql`
        select state, outcome, refusal from agent_invocations
        where run_id = ${runId} order by requested_at
    `;
}
