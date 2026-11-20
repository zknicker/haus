import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { AgentLifecycleEvent } from '@haus/api';
import { onAgentLifecycle } from '../src/agent-delivery/lifecycle.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import {
    connectRunner,
    frameOfType,
    type RunnerClient,
    type RunnerFrame,
    testRunnerToken,
} from './runner.fixture.ts';

const computerId = `cmp_${'q'.repeat(16)}`;
let harness: HausServerHarness;
let owner: HausClient;
let runner: RunnerClient;
let serverId: string;
let agentId: string;
let dmChatId: string;
let firstRunId: string;
let stoppedRunId: string;

beforeAll(async () => {
    harness = await startHausServerHarness({ agentLoop: 'runner', runnerToken: testRunnerToken });
    harness.humans.setVerifiedEmails('user_runner_owner', ['ada@haus.test']);
    owner = createHausClient(harness, await harness.humans.mintSessionToken('user_runner_owner'));
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Runner HQ', slug: 'runner-hq' })
    ).id;
    await owner.trpc.member.updateProfile.mutate({
        description: null,
        displayName: 'Ada',
        handle: 'ada',
        serverId,
    });
    const userId = harness.humans.userIdForSubject('user_runner_owner');
    await harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        values (
            ${computerId}, ${serverId}, ${userId}, ${'e'.repeat(64)},
            ${{ runtimes: [{ id: 'codex', label: 'Codex', models: [{ id: 'gpt-5.6-sol', label: 'Sol' }] }] }}::jsonb,
            'healthy'
        )
    `;
    agentId = (
        await owner.trpc.agent.create.mutate({
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

test('a DM reaches the runner with a working run credential while the Computer is offline', async () => {
    await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'Can you check the deploy?',
        nonce: 'runner_dm_first',
        serverId,
    });

    runner = connectRunner(harness, testRunnerToken);
    const start = await runner.next(frameOfType('runner-start'));
    const { runId } = startOf(start);

    expect(startOf(start)).toMatchObject({ agentId, chatId: dmChatId, type: 'start' });
    expect(start.reasoningEffort).toBe('high');
    expect(start.runCredential).toMatch(/^grtr_[A-Za-z0-9_-]{43}$/u);
    const [credential] = await harness.sql`
        select computer_id, run_id, revoked_at from agent_runner_credentials
        where agent_id = ${agentId} and run_id = ${runId}
    `;
    expect(credential).toEqual({ computer_id: null, revoked_at: null, run_id: runId });
    expect((await agentSend(start, 'runner_reply_first')).status).toBe(200);
});

test('ack, a busy notice, then a turn settle the run and revoke its credential', async () => {
    const start = await runner.next(frameOfType('runner-start'));
    const { runId } = startOf(start);
    firstRunId = runId;
    const accepted = lifecycle(runId, 'reading');
    runner.send({ agentId, runId, type: 'ack' });
    await accepted;

    await owner.trpc.chat.send.mutate({
        chatId: dmChatId,
        content: 'Also look at the logs.',
        nonce: 'runner_dm_busy',
        serverId,
    });
    expect(await runner.next(frameOfType('notice', { runId }))).toMatchObject({
        agentId,
        type: 'notice',
    });

    const settled = lifecycle(runId, 'settled');
    runner.send(turn(runId));
    expect(await settled).toMatchObject({ outcome: 'completed', runId });

    expect((await agentSend(start, 'runner_reply_after_settle')).status).toBe(401);
});

test('a human Stop reaches the runner and revokes the run credential', async () => {
    const start = await runner.next(
        (frame) => frame.type === 'runner-start' && startOf(frame).runId !== firstRunId
    );
    const { runId } = startOf(start);
    expect(startOf(start).chatId).toBe(dmChatId);

    await owner.trpc.agent.stop.mutate({ agentId, serverId });

    expect(await runner.next(frameOfType('stop', { runId }))).toEqual({
        agentId,
        runId,
        type: 'stop',
    });
    expect((await agentSend(start, 'runner_reply_after_stop')).status).toBe(401);
    stoppedRunId = runId;
});

test('a reattaching runner gets its unacknowledged start again with a fresh credential', async () => {
    await owner.trpc.agent.start.mutate({ agentId, serverId });
    const start = await runner.next(
        (frame) =>
            frame.type === 'runner-start' &&
            ![firstRunId, stoppedRunId].includes(startOf(frame).runId)
    );

    const replacement = connectRunner(harness, testRunnerToken);
    const resent = await replacement.next(frameOfType('runner-start'));
    await runner.closed;
    runner = replacement;

    expect(startOf(resent).runId).toBe(startOf(start).runId);
    expect(resent.runCredential).not.toBe(start.runCredential);
    expect(resent.reasoningEffort).toBe('high');
    expect((await agentSend(resent, 'runner_reply_after_reattach')).status).toBe(200);
});

function startOf(frame: RunnerFrame) {
    return frame.start as { agentId: string; chatId: string | null; runId: string; type: string };
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

async function agentSend(start: RunnerFrame, nonce: string) {
    return await fetch(new URL('/api/agent/messages/send', harness.url), {
        body: JSON.stringify({ content: 'On it.', nonce, target: 'dm:@ada' }),
        headers: {
            authorization: `Bearer ${String(start.runCredential)}`,
            'content-type': 'application/json',
        },
        method: 'POST',
    });
}

function turn(runId: string) {
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
