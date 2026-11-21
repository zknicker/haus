import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHomedAgent } from './agent-home.fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { collectStream } from './realtime-stream.ts';
import {
    connectRunner,
    reportRunnerModels,
    frameOfType,
    type RunnerClient,
    testRunnerToken,
} from './runner.fixture.ts';

const computerId = `cmp_${'q'.repeat(16)}`;
let harness: HausServerHarness;
let owner: HausClient;
let runner: RunnerClient;
let serverId: string;
let agentId: string;
let dmChatId: string;

beforeAll(async () => {
    harness = await startHausServerHarness({ runnerToken: testRunnerToken });
    harness.humans.setVerifiedEmails('user_runner_working', ['ada-working@haus.test']);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_runner_working'));
    serverId = (
        await owner.trpc.server.create.mutate({
            displayName: 'Runner Working HQ',
            slug: 'runner-working-hq',
        })
    ).id;
    await owner.trpc.member.updateProfile.mutate({
        description: null,
        displayName: 'Ada',
        handle: 'ada',
        serverId,
    });
    const userId = harness.humans.userIdForSubject('user_runner_working');
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (
            ${computerId}, ${serverId}, ${userId}, ${'e'.repeat(64)},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
    await reportRunnerModels(harness);
    agentId = (
        await createHomedAgent(owner, {
            computerId,
            displayName: 'Orbit',
            handle: 'orbit',
            modelId: 'gpt-5.6-sol',
            reasoningEffort: 'high',
            runtimeId: 'codex',
            serverId,
        })
    ).agent.id;
    dmChatId = (await owner.trpc.chat.ensureAgentDm.mutate({ agentId, serverId })).id;
});

afterAll(async () => {
    runner?.close();
    owner?.close();
    await harness?.close();
});

test('a runner run shows the Agent as working from dispatch through ack, then settles', async () => {
    const lifecycle = collectStream(owner.trpc.agent.onLifecycle, { serverId });
    runner = connectRunner(harness, testRunnerToken);
    await runner.next(frameOfType('runner-hello-accepted'));
    await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'Can you check the deploy?',
        nonce: 'runner_working_first',
        serverId,
    });
    const start = await runner.next(frameOfType('runner-start'));
    const runId = (start.start as { runId: string }).runId;

    expect(await lifecycle.next((event) => event.runId === runId)).toMatchObject({
        agentId,
        phase: 'working',
        runId,
    });
    expect(await availability()).toBe('working');

    runner.send({ agentId, runId, type: 'ack' });
    await lifecycle.next((event) => event.runId === runId && event.phase === 'reading');
    expect(await availability()).toBe('working');

    runner.send(settledTurn(runId));
    expect(
        await lifecycle.next((event) => event.runId === runId && event.phase === 'settled')
    ).toMatchObject({ outcome: 'completed' });
});

async function availability() {
    const agents = await owner.trpc.agent.list.query({ serverId });
    return agents.find((agent) => agent.id === agentId)?.availability;
}

function settledTurn(runId: string) {
    const now = new Date().toISOString();
    return {
        activity: { operations: [] },
        agentId,
        endedAt: now,
        messageCount: 1,
        modelId: 'gpt-5.6-sol',
        outputProduced: true,
        runId,
        runtimeId: 'codex',
        startedAt: now,
        status: 'completed',
        summary: 'Checked the deploy.',
        tokenUsage: null,
        type: 'turn',
        visibleMessages: [],
    };
}
