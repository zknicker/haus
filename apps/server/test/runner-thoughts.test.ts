import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentLifecycleEvent, AgentThoughtEvent, AgentThoughtFrame } from '@haus/api';
import { onAgentLifecycle } from '../src/agent-delivery/lifecycle.ts';
import { createHomedAgent } from './agent-home.fixture.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    type RunnerFrame,
    reportRunnerModels,
    testRunnerToken,
} from './runner.fixture.ts';

const computerId = `cmp_${'t'.repeat(16)}`;
let harness: HausServerHarness;
let owner: HausClient;
let runner: RunnerClient;
let serverId: string;
let agentId: string;
let dmChatId: string;

beforeAll(async () => {
    harness = await startHausServerHarness({ runnerToken: testRunnerToken });
    harness.humans.setVerifiedEmails('user_runner_thoughts', ['ada@haus.test']);
    owner = createHausClient(
        harness,
        await harness.humans.mintSessionToken('user_runner_thoughts')
    );
    serverId = (
        await owner.trpc.server.create.mutate({
            displayName: 'Thought HQ',
            slug: 'runner-thoughts',
        })
    ).id;
    await owner.trpc.member.updateProfile.mutate({
        description: null,
        displayName: 'Ada',
        handle: 'ada',
        serverId,
    });
    const userId = harness.humans.userIdForSubject('user_runner_thoughts');
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

test('a runner thought for its engaged run reaches readers of that Chat', async () => {
    await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'Can you check the deploy?',
        nonce: 'runner_thought_ask',
        serverId,
    });
    runner = connectRunner(harness, testRunnerToken);
    const start = await runner.next(frameOfType('runner-start'));
    const { runId } = startOf(start);
    const accepted = lifecycle(runId, 'reading');
    runner.send({ agentId, runId, type: 'ack' });
    await accepted;
    const pulled = await fetch(new URL('/api/agent/events', harness.url), {
        headers: { authorization: `Bearer ${String(start.runCredential)}` },
    });
    expect(pulled.status).toBe(200);

    const heard = Promise.withResolvers<AgentThoughtEvent>();
    const listening = Promise.withResolvers<void>();
    const subscription = owner.trpc.chat.onThought.subscribe(
        { chatId: dmChatId, serverId },
        {
            onData: (event) => heard.resolve(event),
            onError: (error) => heard.reject(error),
            onStarted: () => listening.resolve(),
        }
    );
    await listening.promise;
    const at = new Date().toISOString();
    const thought: AgentThoughtFrame = {
        agentId,
        at,
        kind: 'phrase',
        runId,
        text: 'Checking the deploy log',
        type: 'agent-thought',
    };
    runner.send(thought);

    expect(await heard.promise).toEqual({
        agentId,
        at,
        chatId: dmChatId,
        runId,
        serverId,
        text: 'Checking the deploy log',
    });
    subscription.unsubscribe();
});

function startOf(frame: RunnerFrame) {
    return frame.start as { agentId: string; runId: string };
}

function lifecycle(runId: string, phase: AgentLifecycleEvent['phase']) {
    return new Promise<AgentLifecycleEvent>((resolve) => {
        const stop = onAgentLifecycle((event) => {
            if (event.runId === runId && event.phase === phase) {
                stop();
                resolve(event);
            }
        });
    });
}
