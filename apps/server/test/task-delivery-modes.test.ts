import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { TaskDeliveryMode } from '@haus/api';
import { AgentDelivery } from '../src/agent-delivery/delivery.ts';
import { readAgentDispatchConfig } from '../src/agent-delivery/dispatch-config.ts';
import { startFrame } from '../src/agent-delivery/drain-selection.ts';
import { readDeliveryState } from '../src/agent-delivery/store.ts';
import { sendChatMessage } from '../src/chats/send-message.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import type { HausUser } from '../src/users/haus-user.ts';
import { agentCreationFixture } from './agent-creation-fixture.ts';
import { RecordingRunner } from './recording-runner.ts';

const fixture = agentCreationFixture();
let connection: HausConnection;
let orbit: { token: string };
let peer: { token: string };

beforeAll(async () => {
    connection = await connectHausDatabase(fixture.harness.databaseUrl);
    orbit = await fixture.mintRunner('run_delivery_modes_orbit');
    peer = await fixture.mintRunner('run_delivery_modes_peer', fixture.peerAgentId);
});

afterAll(async () => {
    await connection?.close();
});

test('a person’s message reaches the Task agent, addressed, with its delivery mode', async () => {
    const task = await startCrew(orbit, 'Draft the release notes.');
    for (const delivery of ['steer', 'interrupt', 'queue'] as const) {
        await post(task.chatId, `A ${delivery} message.`, delivery, liveDelivery(task).delivery);
    }
    expect(
        await fixture.harness.sql`
            select delivery, addressed_reason from agent_inbox
            where agent_id = ${task.agentId} and source = 'human' order by created_at
        `
    ).toEqual([
        { addressed_reason: 'task_chat', delivery: 'steer' },
        { addressed_reason: 'task_chat', delivery: 'interrupt' },
        { addressed_reason: 'task_chat', delivery: 'queue' },
    ]);
});

test('a busy Task hears steer at its next boundary, never queue', async () => {
    const task = await startCrew(orbit, 'Profile the nightly export.');
    const { delivery, runner } = liveDelivery(task);
    await delivery.dispatchAgent(task.agentId, fixture.serverId);
    const runId = runner.starts()[0]?.runId ?? '';
    await delivery.onAck({ agentId: task.agentId, runId });

    await post(task.chatId, 'Only after this turn.', 'queue', delivery);
    await delivery.dispatchAgent(task.agentId, fixture.serverId);
    expect(runner.framesOfType('notice')).toEqual([]);

    await post(task.chatId, 'Check the index too.', 'steer', delivery);
    await delivery.dispatchAgent(task.agentId, fixture.serverId);
    const [notice] = runner.framesOfType('notice');
    const noticed = notice?.inbox.map((item) => item.content) ?? [];
    expect(noticed).toContain('Check the index too.');
    expect(noticed).not.toContain('Only after this turn.');

    const taskRunner = await fixture.mintRunner(runId, task.agentId, task.chatId, false);
    const pulled = await fetch(new URL('/api/agent/events', fixture.harness.url), {
        headers: { authorization: `Bearer ${taskRunner.token}` },
    });
    const { messages } = (await pulled.json()) as {
        messages: Array<{ message: { content: string } }>;
    };
    const pulledContent = messages.map((row) => row.message.content);
    expect(pulledContent).toContain('Check the index too.');
    expect(pulledContent).not.toContain('Only after this turn.');
});

test('interrupt aborts the live turn and runs again, the interrupting message first', async () => {
    const task = await startCrew(orbit, 'Rotate the signing key.');
    const { delivery, runner } = liveDelivery(task);
    await delivery.dispatchAgent(task.agentId, fixture.serverId);
    const first = runner.starts()[0];
    await delivery.onAck({ agentId: task.agentId, runId: first?.runId ?? '' });

    const sent = await post(task.chatId, 'Stop: use the new vault.', 'interrupt', delivery);
    expect(sent.interrupts).toEqual([{ agentId: task.agentId, serverId: fixture.serverId }]);
    await delivery.interrupt({ agentId: task.agentId, serverId: fixture.serverId });

    expect(runner.framesOfType('stop')).toMatchObject([{ runId: first?.runId, type: 'stop' }]);
    const second = runner.starts()[1];
    expect(second?.runId).not.toBe(first?.runId);
    expect(second?.inbox.map((item) => item.content)).toEqual([
        'Stop: use the new vault.',
        'Rotate the signing key.',
    ]);
    expect((await readDeliveryState(connection.db, task.agentId))?.activeRunId).toBe(
        second?.runId ?? ''
    );
});

test('an interrupting message drains ahead of older messages that fill the budget, on resend too', async () => {
    const task = await startCrew(orbit, 'Audit the vault.');
    const { delivery, runner } = liveDelivery(task);
    await delivery.dispatchAgent(task.agentId, fixture.serverId);
    const first = runner.starts()[0];
    await delivery.onAck({ agentId: task.agentId, runId: first?.runId ?? '' });
    for (const index of [1, 2, 3]) {
        await post(task.chatId, `${index}${'x'.repeat(9000)}`, 'steer', delivery);
    }
    const sent = await post(task.chatId, 'Stop: wrong vault.', 'interrupt', delivery);
    await delivery.interrupt({ agentId: task.agentId, serverId: fixture.serverId });

    const second = runner.starts()[1];
    expect(second?.drainItemIds).toContain(sent.receipt.message.id);
    expect(second?.inbox[0]?.content).toBe('Stop: wrong vault.');
    const state = await readDeliveryState(connection.db, task.agentId);
    const config = await readAgentDispatchConfig(connection.db, task.agentId);
    if (!(state && config)) {
        throw new Error('The Task has no delivery state.');
    }
    const resent = (await startFrame(connection.db, state, config)) as typeof second;
    expect(resent?.drainItemIds).toEqual(second?.drainItemIds ?? []);
    expect(resent?.inbox[0]?.content).toBe('Stop: wrong vault.');
});

test('task send from a Captain brings back an archived Task; from a Task it is refused', async () => {
    const task = await startCrew(orbit, 'Audit the copy.');
    await call(orbit, '/api/agent/tasks/archive', { task: task.shortId });
    const sent = await call(orbit, '/api/agent/tasks/send', {
        body: 'One more page to audit.',
        delivery: 'queue',
        task: task.shortId,
    });
    expect(sent).toMatchObject({ body: { task: { archivedAt: null } }, status: 200 });
    expect(
        await fixture.harness.sql`
            select delivery from agent_inbox
            where agent_id = ${task.agentId} and content = 'One more page to audit.'
        `
    ).toEqual([{ delivery: 'queue' }]);

    const sibling = await startCrew(orbit, 'Audit the footer.');
    await call(orbit, '/api/agent/tasks/archive', { task: task.shortId });
    const asTask = await fixture.mintRunner(
        'run_delivery_modes_task',
        sibling.agentId,
        sibling.chatId,
        false
    );
    const refused = await call(asTask, '/api/agent/tasks/send', {
        body: 'Are you done?',
        task: task.shortId,
    });
    expect(refused).toMatchObject({ body: { code: 'TASK_ARCHIVED' }, status: 409 });
});

test('a Task messages only Tasks of its own Project; any Captain may send', async () => {
    const own = await startCrew(orbit, 'Fix the build.');
    const elsewhere = await startCrew(peer, 'Fix the ops dashboard.');
    const asTask = await fixture.mintRunner(
        'run_delivery_modes_cross',
        own.agentId,
        own.chatId,
        false
    );
    expect(
        await call(asTask, '/api/agent/tasks/send', { body: 'Hi.', task: elsewhere.shortId })
    ).toMatchObject({ body: { code: 'INVALID_ARG' }, status: 400 });
    expect(
        await call(orbit, '/api/agent/tasks/send', { body: 'Hi.', task: elsewhere.shortId })
    ).toMatchObject({ status: 200 });
});

async function startCrew(runner: { token: string }, brief: string) {
    const reply = await call(runner, '/api/agent/tasks/start', {
        brief,
        machine: fixture.computerId,
    });
    const shortId = (reply.body.task as { shortId: string }).shortId;
    const task = await fixture.owner.trpc.task.get.query({ serverId: fixture.serverId, shortId });
    return { agentId: task.agentId ?? '', chatId: task.chatId ?? '', id: task.id, shortId };
}

function liveDelivery(task: { agentId: string }) {
    const runner = new RecordingRunner();
    runner.attach(task.agentId);
    const transport = { isOnline: () => true, send: () => true };
    return { delivery: new AgentDelivery(connection.db, transport, undefined, runner), runner };
}

async function post(
    chatId: string,
    content: string,
    delivery: TaskDeliveryMode,
    agentDelivery: AgentDelivery
) {
    return await sendChatMessage(
        connection.db,
        { id: fixture.ownerUserId } as HausUser,
        {
            attachmentIds: [],
            chatId,
            content,
            delivery,
            nonce: createOpaqueId('non'),
            serverId: fixture.serverId,
        },
        agentDelivery
    );
}

async function call(runner: { token: string }, path: string, body: unknown) {
    const response = await fetch(new URL(path, fixture.harness.url), {
        body: JSON.stringify(body),
        headers: { authorization: `Bearer ${runner.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    return {
        body: (await response.json()) as Record<string, unknown> & { code?: string },
        status: response.status,
    };
}
