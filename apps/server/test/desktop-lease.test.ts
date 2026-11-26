import { afterAll, beforeAll, expect, test } from 'bun:test';
import { desktopLeaseIdleMs } from '../src/agent-invocations/desktop-lease.ts';
import { createHomedAgent } from './agent-home.fixture.ts';
import {
    connectComputer,
    type FrameClient,
    type InvocationHarness,
    manualInvocationClock,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

const time = manualInvocationClock();
let setup: InvocationHarness;
let runner: RunnerClient;
let computer: FrameClient;
let otherAgentId: string;

beforeAll(async () => {
    setup = await startInvocationHarness({ clock: time.clock, slug: 'desktop-lease' });
    await setup.harness.sql`
        update computers set reported_inventory = reported_inventory || '{"name":"Studio"}'::jsonb
        where id = ${setup.computerId}
    `;
    otherAgentId = (
        await createHomedAgent(setup.owner, {
            computerId: setup.computerId,
            displayName: 'Comet',
            handle: 'comet',
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'high',
            runtimeId: 'codex',
            serverId: setup.serverId,
        })
    ).agent.id;
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
    await setup?.close();
});

test("a second session's desktop call is refused desktop-busy naming the holder, until the lease idles out", async () => {
    await completeDesktop(setup.agentId, 'run_holder', 'toolu_first');

    desktop(otherAgentId, 'run_other', 'toolu_busy');
    expect(await answerFor('toolu_busy')).toMatchObject({
        agentId: otherAgentId,
        outcome: 'failed',
        output: {
            kind: 'text',
            text: "Studio's desktop is in use by Orbit. Nothing ran. Try again once it is done.",
        },
    });
    expect(
        await setup.harness.sql`
            select refusal from agent_invocations where run_id = 'run_other'
        `
    ).toEqual([{ refusal: 'desktop-busy' }]);

    await completeDesktop(setup.agentId, 'run_holder', 'toolu_again');
    time.advance(desktopLeaseIdleMs);
    await completeDesktop(otherAgentId, 'run_after', 'toolu_after');
});

async function completeDesktop(agentId: string, runId: string, toolCallId: string) {
    desktop(agentId, runId, toolCallId);
    const invoke = await computer.next(
        (frame) =>
            frame.type === 'invoke' && frame.runId === runId && !answered.has(frame.invocationId)
    );
    answered.add(invoke.invocationId);
    computer.send({
        invocationId: invoke.invocationId,
        outcome: 'completed',
        output: { kind: 'text', text: 'ok' },
        truncated: false,
        type: 'invoke-result',
    });
    expect(await answerFor(toolCallId)).toMatchObject({ outcome: 'completed' });
}

const answered = new Set<unknown>();

function desktop(agentId: string, runId: string, toolCallId: string) {
    runner.send({
        agentId,
        operation: { args: ['snapshot'], kind: 'desktop' },
        runId,
        seq: 0,
        sessionGeneration: 1,
        toolCallId,
        type: 'invocation-request',
    });
}

async function answerFor(toolCallId: string) {
    return await runner.next(frameOfType('invocation-result', { toolCallId }));
}
