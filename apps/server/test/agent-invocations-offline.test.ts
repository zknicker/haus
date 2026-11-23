import { afterAll, beforeAll, expect, test } from 'bun:test';
import { type AgentLifecycleEvent, computerProtocolVersion } from '@haus/api';
import { onAgentLifecycle } from '../src/agent-delivery/lifecycle.ts';
import {
    connectComputer,
    type InvocationHarness,
    invocationRequest,
    startInvocationHarness,
} from './agent-invocations.fixture.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

const noticeText = 'The machine is offline. Nothing ran. `haus` and `execute` still work.';
let setup: InvocationHarness;
let runner: RunnerClient;

beforeAll(async () => {
    setup = await startInvocationHarness({ slug: 'invocations-offline' });
});

afterAll(async () => {
    runner?.close();
    await setup?.close();
});

test('a detached Computer answers offline at once and records it', async () => {
    runner = connectRunner(setup.harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));

    const answer = await requestOffline('run_detached', 'toolu_detached', homeOfflineText());

    expect(await recorded('run_detached')).toEqual([
        { computer_id: setup.computerId, outcome: 'offline', state: 'finished' },
    ]);
    expect(answer.invocationId).toMatch(/^inv_[A-Za-z0-9_-]{16}$/u);
});

test('a Computer in update-required mode answers offline and is sent nothing', async () => {
    const computer = await connectComputer(
        setup.harness,
        setup.computerCredential,
        computerProtocolVersion - 1
    );
    expect(computer.frames.find((frame) => frame.type === 'bootstrap-accepted')?.mode).toBe(
        'update-required'
    );

    await requestOffline('run_updating', 'toolu_updating', homeOfflineText());

    expect(await recorded('run_updating')).toEqual([
        { computer_id: setup.computerId, outcome: 'offline', state: 'finished' },
    ]);
    computer.close();
    await computer.closed;
    expect(computer.frames.map((frame) => frame.type)).not.toContain('invoke');
});

test('an Agent with no Computer answers offline and records no machine', async () => {
    await setup.harness.sql`
        update agents set computer_id = null, desired_runtime_id = null, desired_model_id = null
        where id = ${setup.agentId}
    `;

    await requestOffline('run_unplaced', 'toolu_unplaced', noticeText);

    expect(await recorded('run_unplaced')).toEqual([
        { computer_id: null, outcome: 'offline', state: 'finished' },
    ]);
});

test('a turn whose machine is offline completes with only haus calls', async () => {
    const chatId = (
        await setup.owner.trpc.chat.ensureAgentDm.mutate({
            agentId: setup.agentId,
            serverId: setup.serverId,
        })
    ).id;
    await setup.owner.trpc.chat.send.mutate({
        chatId,
        content: 'Can you check the deploy?',
        nonce: 'offline_turn',
        serverId: setup.serverId,
    });
    const start = await runner.next(frameOfType('runner-start'));
    const { runId } = start.start as { runId: string };
    runner.send({ agentId: setup.agentId, runId, type: 'ack' });

    await requestOffline(runId, 'toolu_machine', noticeText);
    const sent = await fetch(new URL('/api/agent/messages/send', setup.harness.url), {
        body: JSON.stringify({
            content: 'Machine is offline.',
            nonce: 'offline_reply',
            target: 'dm:@ada',
        }),
        headers: {
            authorization: `Bearer ${String(start.runCredential)}`,
            'content-type': 'application/json',
        },
        method: 'POST',
    });
    expect(sent.status).toBe(200);
    const settled = settledEvent(runId);
    runner.send(turn(runId));

    expect(await settled).toMatchObject({ outcome: 'completed', runId });
});

function homeOfflineText() {
    return `${setup.computerId} is offline. Nothing ran. \`haus\` and \`execute\` still work, and \`haus computer list\` shows which Computers are online.`;
}

async function requestOffline(runId: string, toolCallId: string, text: string) {
    runner.send(invocationRequest(setup.agentId, runId, toolCallId));
    const answer = await runner.next(frameOfType('invocation-result', { toolCallId }));
    expect(answer).toMatchObject({
        agentId: setup.agentId,
        outcome: 'offline',
        output: { kind: 'text', text },
        runId,
        seq: 0,
        toolCallId,
        truncated: false,
    });
    return answer;
}

async function recorded(runId: string) {
    return await setup.harness.sql`
        select computer_id, outcome, state from agent_invocations where run_id = ${runId}
    `;
}

function settledEvent(runId: string) {
    return new Promise<AgentLifecycleEvent>((resolve) => {
        const stop = onAgentLifecycle((event) => {
            if (event.runId === runId && event.phase === 'settled') {
                stop();
                resolve(event);
            }
        });
    });
}

function turn(runId: string) {
    const now = new Date().toISOString();
    return {
        activity: { operations: [] },
        agentId: setup.agentId,
        endedAt: now,
        messageCount: 1,
        modelId: 'gpt-5.6-sol',
        outputProduced: true,
        runId,
        runtimeId: 'codex',
        startedAt: now,
        status: 'completed',
        summary: 'Reported the machine offline.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}
