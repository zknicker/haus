import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import type { TaskAgentDelivery } from '../src/tasks/task-assignment.ts';
import { startTask } from '../src/tasks/task-start.ts';
import type { HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { taskFixture } from './task-fixture.ts';
import { startTestTask } from './task-place-fixture.ts';

const agentId = 'agt_task_api';
const agent = { agentId, kind: 'agent' } as const;
const noDelivery = {
    enqueue: () => Promise.reject(new Error('A self-assigned start enqueues nothing.')),
} as unknown as TaskAgentDelivery;
let allChatId: string;
let connection: HausConnection;
let fixture: ReturnType<typeof taskFixture>;
let harness: HausServerHarness;
let owner: HausClient;
let ownerUserId: string;
let peer: HausClient;
let peerUserId: string;
let serverId: string;

beforeAll(async () => {
    harness = await startHausServerHarness();
    fixture = taskFixture(harness);
    connection = await connectHausDatabase(harness.databaseUrl);
    owner = await fixture.signIn('user_task_api_owner');
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Task API Server',
        slug: 'task-api-server',
    });
    serverId = server.id;
    allChatId = server.channels[0]?.id ?? '';
    ownerUserId = server.viewerUserId;
    ({ client: peer, userId: peerUserId } = await fixture.addMember(
        serverId,
        'user_task_api_peer'
    ));
    await fixture.addAgent(serverId, agentId, 'task-agent');
});

afterAll(async () => {
    owner?.close();
    peer?.close();
    await connection?.close();
    await harness?.close();
});

async function send(content: string) {
    const nonce = `task-api-${crypto.randomUUID()}`;
    return (await owner.trpc.chat.send.mutate({ chatId: allChatId, content, nonce, serverId }))
        .message;
}

describe('task numbering and versions', () => {
    test('numbers Tasks from the key ledger without collisions under concurrency', async () => {
        const origins = await Promise.all(Array.from({ length: 8 }, (_, i) => send(`Work ${i}`)));
        const started = await Promise.all(
            origins.map((origin, index) =>
                startTask(connection.db, agent, noDelivery, {
                    assignee: agent,
                    originChatId: allChatId,
                    originMessageId: origin.id,
                    serverId,
                    state: 'todo',
                    title: `Parallel ${index}`,
                })
            )
        );
        const numbers = started.map(({ task }) => task.number).toSorted((a, b) => a - b);
        expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(started.every(({ task }) => task.key === `GEN-${task.number}`)).toBe(true);
        expect(started[0]?.task).toMatchObject({
            assignee: agent,
            completedAt: null,
            createdBy: agent,
            description: '',
            priority: 'none',
            state: 'todo',
            version: 1,
        });
        const [ledger] = await owner.trpc.taskKey.list.query({ serverId });
        expect(ledger).toMatchObject({ key: 'GEN', nextNumber: 9 });
    });

    test('every mutation fails closed on a stale expectedVersion', async () => {
        const task = await startTestTask(harness, owner, {
            channelId: allChatId,
            serverId,
            title: 'Edit',
        });
        const edited = await owner.trpc.task.update.mutate({
            expectedVersion: 1,
            patch: { dueOn: '2026-12-01', priority: 'high', title: 'Edited' },
            serverId,
            taskId: task.id,
        });
        expect(edited.task).toMatchObject({ dueOn: '2026-12-01', priority: 'high', version: 2 });
        const stale = { expectedVersion: 1, serverId, taskId: task.id };
        await expect(
            owner.trpc.task.update.mutate({ ...stale, patch: { title: 'Lost' } })
        ).rejects.toThrow(/changed/);
        await expect(owner.trpc.task.setState.mutate({ ...stale, state: 'done' })).rejects.toThrow(
            /changed/
        );
        await expect(owner.trpc.task.assign.mutate({ ...stale, assignee: null })).rejects.toThrow(
            /changed/
        );
    });
});

describe('states', () => {
    test('closing sets completedAt, closing again keeps it, and reopening clears it', async () => {
        const task = await startTestTask(harness, owner, {
            channelId: allChatId,
            serverId,
            title: 'Ship',
        });
        const at = { serverId, taskId: task.id };
        const done = await owner.trpc.task.setState.mutate({
            ...at,
            expectedVersion: 1,
            state: 'done',
        });
        const completedAt = done.task.completedAt;
        expect(completedAt).not.toBeNull();
        const canceled = await owner.trpc.task.setState.mutate({
            ...at,
            expectedVersion: 2,
            state: 'canceled',
        });
        expect(canceled.task.completedAt).toBe(completedAt);
        const reopened = await owner.trpc.task.setState.mutate({
            ...at,
            expectedVersion: 3,
            state: 'open',
        });
        expect(reopened.task).toMatchObject({ completedAt: null, state: 'open', version: 4 });
    });

    test('a chatless Task is read-only history', async () => {
        await harness.sql`
            insert into tasks (id, server_id, key_id, number, title, state, completed_at,
                created_by_user_id, project_id)
            select 'tsk_task_api_history', ${serverId}, task_keys.id, 900, 'Old', 'done', now(),
                ${ownerUserId}, projects.chat_id
            from task_keys join projects on projects.task_key_id = task_keys.id
            where task_keys.server_id = ${serverId} and task_keys.key = 'GEN'
        `;
        const history = await owner.trpc.task.get.query({ key: 'GEN-900', serverId });
        expect(history).toMatchObject({ chatId: null, origin: null, state: 'done' });
        const at = { expectedVersion: 1, serverId, taskId: history.id };
        await expect(owner.trpc.task.setState.mutate({ ...at, state: 'open' })).rejects.toThrow(
            /read-only history/
        );
        await expect(owner.trpc.task.assign.mutate({ ...at, assignee: null })).rejects.toThrow(
            /read-only history/
        );
        await expect(
            owner.trpc.task.update.mutate({ ...at, patch: { title: 'New' } })
        ).rejects.toThrow(/read-only history/);
    });
});

describe('assignment', () => {
    test('a person assigned follows the Task, and the assignment posts nothing', async () => {
        const task = await startTestTask(harness, owner, {
            channelId: allChatId,
            serverId,
            title: 'For the peer',
        });
        await owner.trpc.task.assign.mutate({
            assignee: { kind: 'user', userId: peerUserId },
            expectedVersion: 1,
            serverId,
            taskId: task.id,
        });
        const peerView = await peer.trpc.task.get.query({ serverId, taskId: task.id });
        expect(peerView).toMatchObject({ followed: true, unreadCount: 0 });
        const [posts] = (await harness.sql`
            select count(*)::integer as count from chat_messages where chat_id = ${task.chatId}
        `) as { count: number }[];
        expect(posts?.count).toBe(0);

        await owner.trpc.task.assign.mutate({
            assignee: agent,
            expectedVersion: 2,
            serverId,
            taskId: task.id,
        });
        const wakes = await harness.sql`
            select dedupe_key from agent_inbox
            where agent_id = ${agentId} and source = 'task_assignment'
        `;
        expect(wakes).toEqual([{ dedupe_key: `task-assign:${task.id}:3` }]);

        const assigned = await owner.trpc.task.assign.mutate({
            assignee: { kind: 'user', userId: ownerUserId },
            expectedVersion: 3,
            serverId,
            taskId: task.id,
        });
        const again = await owner.trpc.task.assign.mutate({
            assignee: { kind: 'user', userId: ownerUserId },
            expectedVersion: 4,
            serverId,
            taskId: task.id,
        });
        expect(again.task.version).toBe(assigned.task.version);
    });

    test('refuses an assignee who is not an active member or Agent', async () => {
        const task = await startTestTask(harness, owner, {
            channelId: allChatId,
            serverId,
            title: 'Nobody',
        });
        await expect(
            owner.trpc.task.assign.mutate({
                assignee: { agentId: 'agt_missing', kind: 'agent' },
                expectedVersion: 1,
                serverId,
                taskId: task.id,
            })
        ).rejects.toThrow(/active member or Agent/);
    });
});

describe('reads', () => {
    test('get by key with Mentioned in, and list by assignee and state', async () => {
        const task = await startTestTask(harness, owner, {
            channelId: allChatId,
            serverId,
            title: 'Rotate the staging credentials',
        });
        const mention = await send(`Tracking ${task.key}`);
        const detail = await owner.trpc.task.get.query({ key: task.key, serverId });
        expect(detail.id).toBe(task.id);
        expect(detail.origin).toEqual({ chatId: allChatId, messageId: task.originMessageId });
        expect(detail.mentions).toEqual([
            expect.objectContaining({ chatId: allChatId, messageId: mention.id }),
        ]);
        expect(detail.reminders).toEqual([]);
        await expect(owner.trpc.task.get.query({ key: 'GEN-9999', serverId })).rejects.toThrow(
            /GEN-9999/
        );

        await owner.trpc.task.assign.mutate({
            assignee: { kind: 'user', userId: peerUserId },
            expectedVersion: 1,
            serverId,
            taskId: task.id,
        });
        await owner.trpc.task.setState.mutate({
            expectedVersion: 2,
            serverId,
            state: 'done',
            taskId: task.id,
        });
        const peers = await owner.trpc.task.list.query({
            assignee: { userId: peerUserId },
            serverId,
            states: ['done'],
        });
        expect(peers.map(({ id }) => id)).toEqual([task.id]);
        const unassigned = await owner.trpc.task.list.query({ assignee: 'none', serverId });
        expect(unassigned.every((each) => each.assignee === null)).toBe(true);
        expect(unassigned.length).toBeGreaterThan(0);
    });
});
