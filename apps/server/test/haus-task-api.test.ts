import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { countAgentTaskQueue } from '../src/tasks/task-list.ts';
import type { HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { taskFixture } from './task-fixture.ts';

const agentId = 'agt_task_api';
let allChatId: string;
let boardId: string;
let columns: Record<'active' | 'backlog' | 'canceled' | 'done' | 'todo', string>;
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
    const [general] = await owner.trpc.board.list.query({ serverId });
    if (!general) {
        throw new Error('Expected the General board.');
    }
    boardId = general.id;
    columns = Object.fromEntries(
        general.columns.map((column) => [column.category, column.id])
    ) as typeof columns;
});

afterAll(async () => {
    owner?.close();
    peer?.close();
    await connection?.close();
    await harness?.close();
});

describe('task numbering and versions', () => {
    test('numbers Tasks per board without collisions under concurrency', async () => {
        const created = await Promise.all(
            Array.from({ length: 8 }, (_, index) =>
                owner.trpc.task.create.mutate({ boardId, serverId, title: `Parallel ${index}` })
            )
        );
        const numbers = created.map(({ task }) => task.number).toSorted((a, b) => a - b);
        expect(numbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
        expect(created.every(({ task }) => task.key === `GEN-${task.number}`)).toBe(true);
        expect(created[0]?.task).toMatchObject({
            assignee: null,
            category: 'todo',
            columnId: columns.todo,
            createdBy: { kind: 'user', userId: ownerUserId },
            description: '',
            priority: 'none',
            version: 1,
        });
    });

    test('every mutation fails closed on a stale expectedVersion', async () => {
        const { task } = await owner.trpc.task.create.mutate({ boardId, serverId, title: 'Edit' });
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
        await expect(
            owner.trpc.task.move.mutate({ ...stale, columnId: columns.done })
        ).rejects.toThrow(/changed/);
        await expect(owner.trpc.task.assign.mutate({ ...stale, assignee: null })).rejects.toThrow(
            /changed/
        );
    });
});

describe('moves', () => {
    test('entering a closed column sets completedAt and leaving clears it', async () => {
        const { task } = await owner.trpc.task.create.mutate({ boardId, serverId, title: 'Ship' });
        const done = await owner.trpc.task.move.mutate({
            columnId: columns.done,
            expectedVersion: 1,
            serverId,
            taskId: task.id,
        });
        expect(done.task.category).toBe('done');
        const completedAt = done.task.completedAt;
        expect(completedAt).not.toBeNull();
        const canceled = await owner.trpc.task.move.mutate({
            columnId: columns.canceled,
            expectedVersion: 2,
            serverId,
            taskId: task.id,
        });
        expect(canceled.task.completedAt).toBe(completedAt);
        const reopened = await owner.trpc.task.move.mutate({
            columnId: columns.active,
            expectedVersion: 3,
            serverId,
            taskId: task.id,
        });
        expect(reopened.task).toMatchObject({ category: 'active', completedAt: null, version: 4 });
        const { board: other } = await owner.trpc.board.create.mutate({
            key: 'OTH',
            name: 'Other',
            serverId,
        });
        await expect(
            owner.trpc.task.move.mutate({
                columnId: other.columns[0]?.id ?? '',
                expectedVersion: 4,
                serverId,
                taskId: task.id,
            })
        ).rejects.toThrow(/own board/);
    });
});

describe('assignment and the person Task Inbox', () => {
    test('assign, clear on the assignee move, reassign away, and self-assign', async () => {
        const { task } = await owner.trpc.task.create.mutate({
            assignee: { kind: 'user', userId: peerUserId },
            boardId,
            serverId,
            title: 'For the peer',
        });
        expect(await fixture.inboxItems(task.id)).toEqual([
            {
                assigned_by_agent_id: null,
                assigned_by_user_id: ownerUserId,
                assignment_version: 1,
                cleared: false,
                user_id: peerUserId,
            },
        ]);

        // Someone else moving it leaves the item; the assignee moving it clears it.
        await owner.trpc.task.move.mutate({
            columnId: columns.backlog,
            expectedVersion: 1,
            serverId,
            taskId: task.id,
        });
        expect((await fixture.inboxItems(task.id))[0]?.cleared).toBe(false);
        await peer.trpc.task.move.mutate({
            columnId: columns.active,
            expectedVersion: 2,
            serverId,
            taskId: task.id,
        });
        expect((await fixture.inboxItems(task.id))[0]?.cleared).toBe(true);

        // Reassigning away withdraws the item; the Agent assignee has none.
        await owner.trpc.task.assign.mutate({
            assignee: { agentId, kind: 'agent' },
            expectedVersion: 3,
            serverId,
            taskId: task.id,
        });
        expect(await fixture.inboxItems(task.id)).toEqual([]);
        await expect(countAgentTaskQueue(connection.db, { agentId, serverId })).resolves.toEqual({
            active: 1,
            todo: 0,
        });

        // Reassigning back is a fresh, uncleared item stamped with the new version.
        await owner.trpc.task.assign.mutate({
            assignee: { kind: 'user', userId: peerUserId },
            expectedVersion: 4,
            serverId,
            taskId: task.id,
        });
        expect(await fixture.inboxItems(task.id)).toEqual([
            expect.objectContaining({ assignment_version: 5, cleared: false }),
        ]);

        // Assigning yourself creates nothing.
        const assigned = await owner.trpc.task.assign.mutate({
            assignee: { kind: 'user', userId: ownerUserId },
            expectedVersion: 5,
            serverId,
            taskId: task.id,
        });
        expect(await fixture.inboxItems(task.id)).toEqual([]);
        // The same assignee again changes nothing.
        const again = await owner.trpc.task.assign.mutate({
            assignee: { kind: 'user', userId: ownerUserId },
            expectedVersion: 6,
            serverId,
            taskId: task.id,
        });
        expect(again.task.version).toBe(assigned.task.version);
    });

    test('refuses an assignee who is not an active member or Agent', async () => {
        await expect(
            owner.trpc.task.create.mutate({
                assignee: { agentId: 'agt_missing', kind: 'agent' },
                boardId,
                serverId,
                title: 'Nobody',
            })
        ).rejects.toThrow(/active member or Agent/);
    });
});

describe('Convert to Task and reads', () => {
    test('defaults the description to the source message and records it', async () => {
        const chatId = allChatId;
        const sent = await owner.trpc.chat.send.mutate({
            chatId,
            content: 'Rotate the staging credentials\nThey leaked in the logs.',
            nonce: 'task-api-convert',
            serverId,
        });
        const label = await owner.trpc.taskLabel.create.mutate({ name: 'Security', serverId });
        const { task } = await owner.trpc.task.create.mutate({
            boardId,
            labelIds: [label.label.id],
            serverId,
            sourceMessageId: sent.message.id,
            title: 'Rotate the staging credentials',
        });
        expect(task.description).toBe('Rotate the staging credentials\nThey leaked in the logs.');
        expect(task.labelIds).toEqual([label.label.id]);

        const detail = await owner.trpc.task.get.query({ key: task.key, serverId });
        expect(detail.id).toBe(task.id);
        expect(detail.mentions).toEqual([
            expect.objectContaining({ chatId, messageId: sent.message.id }),
        ]);
        expect(detail.reminders).toEqual([]);
        // The Task is visible to every member; a Chat the reader is not in is not.
        const peerView = await peer.trpc.task.get.query({ serverId, taskId: task.id });
        expect(peerView.key).toBe(task.key);
        expect(peerView.mentions).toEqual([]);
        await expect(owner.trpc.task.get.query({ key: 'GEN-9999', serverId })).rejects.toThrow(
            /GEN-9999/
        );
        await expect(
            owner.trpc.task.create.mutate({
                boardId,
                serverId,
                sourceMessageId: 'msg_missing',
                title: 'No source',
            })
        ).rejects.toThrow(/source message/);
    });

    test('lists by assignee and category', async () => {
        const { task } = await owner.trpc.task.create.mutate({
            assignee: { kind: 'user', userId: peerUserId },
            boardId,
            columnId: columns.done,
            serverId,
            title: 'Finished for the peer',
        });
        const peers = await owner.trpc.task.list.query({
            assignee: { userId: peerUserId },
            categories: ['done'],
            serverId,
        });
        expect(peers.map(({ id }) => id)).toEqual([task.id]);
        expect(await owner.trpc.task.list.query({ assignee: { agentId }, serverId })).toEqual([]);
        const unassigned = await owner.trpc.task.list.query({ assignee: 'none', serverId });
        expect(unassigned.every((task) => task.assignee === null)).toBe(true);
        expect(unassigned.length).toBeGreaterThan(0);
    });
});
