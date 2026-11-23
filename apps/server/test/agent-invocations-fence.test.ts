import { afterAll, beforeAll, expect, test } from 'bun:test';
import {
    attachComputer,
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    invocationRequest,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import { harnessAppOrigin } from './haus-server-harness.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

const laptopId = 'cmp_invfencelaptopxx';
let setup: InvocationHarness;
let runner: RunnerClient;
let studio: FrameClient;
let laptop: FrameClient;
let laptopCredential: string;
let noAccess: string;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'invocation-fence' });
    laptopCredential = await attachComputer(setup, { id: laptopId, name: 'Laptop' });
    const link = `${harnessAppOrigin}/s/invocation-fence/settings/computers/${laptopId}`;
    noAccess = `You don't have access to Laptop. Only @ada can give you access, in Settings → Devices → Laptop (${link}). Run \`haus computer list\` to see the Computers you can use.`;
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    studio = await connectComputer(setup.harness, setup.computerCredential);
    laptop = await connectComputer(setup.harness, laptopCredential);
});

afterAll(async () => {
    runner?.close();
    studio?.close();
    laptop?.close();
    await setup?.close();
});

test('no access refuses no-access before any computer use cause and sends nothing', async () => {
    call('run_denied_desktop', 'desktop');
    const desktop = await answerFor('run_denied_desktop');
    expect(desktop).toMatchObject({ outcome: 'failed' });
    expect(textOf(desktop)).toBe(noAccess);
    call('run_denied_bash');
    expect(textOf(await answerFor('run_denied_bash'))).toBe(noAccess);

    expect(await ledger('run_denied_desktop')).toEqual([
        { computer_id: laptopId, outcome: 'failed', refusal: 'no-access', state: 'finished' },
    ]);
    expect(laptop.frames.filter((frame) => frame.type === 'invoke')).toEqual([]);
});

test('a resend after reconnect checks access again and fences instead of sending', async () => {
    await grant();
    call('run_resend');
    await laptop.next(frameOfType('invoke', { runId: 'run_resend' }));
    laptop.close();
    await laptop.closed;
    await setup.harness.sql`
        delete from computer_agent_access where computer_id = ${laptopId} and agent_id = ${setup.agentId}
    `;

    laptop = await connectComputer(setup.harness, laptopCredential);
    await laptop.next(frameOfType('agent-fence', { agentId: setup.agentId }));
    const refused = await answerFor('run_resend');

    expect(refused).toMatchObject({ outcome: 'failed' });
    expect(textOf(refused)).toBe(noAccess);
    expect(await ledger('run_resend')).toEqual([
        { computer_id: laptopId, outcome: 'failed', refusal: 'no-access', state: 'finished' },
    ]);
    expect(laptop.frames.filter((frame) => frame.type === 'invoke')).toEqual([]);
});

test('revoking access fences open calls on an online Computer, which cancels them', async () => {
    await grant();
    call('run_fence_accepted');
    const accepted = await laptop.next(frameOfType('invoke', { runId: 'run_fence_accepted' }));
    laptop.send({ invocationId: accepted.invocationId, type: 'invoke-accepted' });
    call('run_fence_waiting');
    const waiting = await laptop.next(frameOfType('invoke', { runId: 'run_fence_waiting' }));

    await revoke();
    await laptop.next(frameOfType('agent-fence', { agentId: setup.agentId }));
    for (const invoke of [accepted, waiting]) {
        laptop.send({
            invocationId: invoke.invocationId,
            outcome: 'cancelled',
            output: { kind: 'text', text: 'cancelled' },
            truncated: false,
            type: 'invoke-result',
        });
    }

    for (const runId of ['run_fence_accepted', 'run_fence_waiting']) {
        const answer = await answerFor(runId);
        expect(answer).toMatchObject({ outcome: 'cancelled' });
        expect(textOf(answer)).toBe(noAccess);
        expect(await ledger(runId)).toEqual([
            {
                computer_id: laptopId,
                outcome: 'cancelled',
                refusal: 'no-access',
                state: 'finished',
            },
        ]);
    }
    expect(textOf(await replay('run_fence_accepted'))).toBe(noAccess);
});

test('revoking access settles an unaccepted call at once when its Computer is offline', async () => {
    await grant();
    call('run_fence_offline');
    await laptop.next(frameOfType('invoke', { runId: 'run_fence_offline' }));
    laptop.close();
    await laptop.closed;

    await revoke();
    const answer = await answerFor('run_fence_offline');

    expect(answer).toMatchObject({ outcome: 'failed' });
    expect(textOf(answer)).toBe(noAccess);
    expect(await ledger('run_fence_offline')).toEqual([
        { computer_id: laptopId, outcome: 'failed', refusal: 'no-access', state: 'finished' },
    ]);
});

function call(runId: string, kind: 'bash' | 'desktop' = 'bash') {
    runner.send({
        ...invocationRequest(setup.agentId, runId, runId),
        computer: laptopId,
        ...(kind === 'desktop' ? { operation: { args: ['snapshot'], kind: 'desktop' } } : {}),
    });
}

async function replay(runId: string) {
    const seen = runner.frames.filter((frame) => frame.toolCallId === runId).length;
    call(runId);
    return await runner.next(
        (frame) =>
            frame.type === 'invocation-result' &&
            runner.frames.filter((candidate) => candidate.toolCallId === runId).length === seen + 1
    );
}

async function grant() {
    await setup.owner.trpc.computer.grantAgentAccess.mutate(accessInput());
}

async function revoke() {
    await setup.owner.trpc.computer.revokeAgentAccess.mutate(accessInput());
}

function accessInput() {
    return { agentId: setup.agentId, computerId: laptopId, serverId: setup.serverId };
}

async function answerFor(toolCallId: string) {
    return await runner.next(frameOfType('invocation-result', { toolCallId }));
}

function textOf(answer: Record<string, unknown>) {
    return (answer.output as { text: string }).text;
}

async function ledger(runId: string) {
    return await setup.harness.sql`
        select computer_id, state, outcome, refusal from agent_invocations where run_id = ${runId}
    `;
}
