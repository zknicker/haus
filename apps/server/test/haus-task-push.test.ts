import { afterAll, beforeAll, describe, expect, test } from 'bun:test';

import {
    pushTaskAssignmentBurstPayloadSchema,
    pushTaskAssignmentPayloadSchema,
    type TaskAssignedEvent,
} from '@haus/api';

import { pushTaskAssignments } from '../src/push/task-push.ts';
import { publishRealtime } from '../src/realtime/topic.ts';
import { assignTask } from '../src/tasks/task-assign.ts';
import { type NotificationFixture, startNotificationFixture } from './notification-fixture.ts';
import { deviceToken, FakePushSender } from './push-fake-sender.ts';
import { startTestTask } from './task-place-fixture.ts';

const sender = new FakePushSender();
const adaToken = deviceToken('a4');
const boToken = deviceToken('b5');
let fixture: NotificationFixture;
let channelId: string;

const collapseId = (taskId: string, version: number) => `task-assign:${taskId}:${version}`;

beforeAll(async () => {
    fixture = await startNotificationFixture({ pushReadGraceMs: 0, pushSender: sender });
    const bundleId = 'chat.haus.ios';
    await fixture.owner.trpc.push.registerDevice.mutate({
        bundleId,
        environment: 'sandbox',
        token: adaToken,
    });
    await fixture.peer.trpc.push.registerDevice.mutate({
        bundleId,
        environment: 'sandbox',
        token: boToken,
    });
    const [all] = (await fixture.harness.sql`
        select id from chats where server_id = ${fixture.serverId} and is_all
    `) as { id: string }[];
    channelId = all?.id ?? '';
});

afterAll(async () => {
    await fixture.close();
});

async function assignNew(title: string, assignee: Parameters<typeof assignTask>[3]['assignee']) {
    const { owner, serverId } = fixture;
    const task = await startTestTask(fixture.harness, owner, { channelId, serverId, title });
    await owner.trpc.task.assign.mutate({
        assignee,
        expectedVersion: 1,
        serverId,
        taskId: task.id,
    });
    return task;
}

test('assigning a person pushes their devices with the routing payload', async () => {
    const { peer, peerUserId, serverId } = fixture;
    const task = await assignNew('Rotate the signing key', { kind: 'user', userId: peerUserId });

    const pushes = await sender.sentFor(collapseId(task.id, 2), 1);
    expect(pushes.map((push) => push.device.token)).toEqual([boToken]);
    const { count } = await peer.trpc.chat.unreadChatCount.query();
    expect(pushes[0]?.payload).toEqual({
        aps: {
            alert: { body: 'Rotate the signing key', title: `Ada assigned you ${task.key}` },
            badge: count,
            sound: 'default',
            'thread-id': task.id,
        },
        key: task.key,
        kind: 'task_assignment',
        serverId,
        taskId: task.id,
    });
    expect(pushTaskAssignmentPayloadSchema.parse(pushes[0]?.payload)).toBeDefined();
});

test('a message in a Task carries the Task, so a tap opens it', async () => {
    const { owner, ownerUserId, peer, serverId } = fixture;
    const task = await startTestTask(fixture.harness, owner, {
        channelId,
        serverId,
        title: 'Push me',
    });
    const sent = await peer.trpc.chat.send.mutate({
        chatId: task.chatId,
        content: `[@Ada](user://${ownerUserId}) can you look?`,
        nonce: 'task-push-message',
        serverId,
    });

    const pushes = await sender.sentFor(sent.message.id, 1);
    expect(pushes.map((push) => push.device.token)).toEqual([adaToken]);
    expect(pushes[0]?.payload).toMatchObject({
        chatId: task.chatId,
        conversationChatId: channelId,
        taskId: task.id,
        taskKey: task.key,
    });
});

test('an Agent assigning a person pushes under the Agent name', async () => {
    const { owner, orbitAgentId, peerUserId, serverId } = fixture;
    const task = await startTestTask(fixture.harness, owner, {
        channelId,
        serverId,
        title: 'Handoff',
    });
    const result = await assignTask(
        fixture.database.db,
        { agentId: orbitAgentId, kind: 'agent' },
        { enqueue: () => Promise.resolve() },
        {
            assignee: { kind: 'user', userId: peerUserId },
            expectedVersion: 1,
            serverId,
            taskId: task.id,
        }
    );
    publishRealtime(result.events);

    const pushes = await sender.sentFor(collapseId(task.id, 2), 1);
    expect(pushes[0]?.payload.aps.alert.title).toBe(`Orbit assigned you ${task.key}`);
});

test('no push for self-assignment, an Agent assignee, or an unassigned Task', async () => {
    const { orbitAgentId, owner, ownerUserId, serverId } = fixture;
    const own = await assignNew('Mine', { kind: 'user', userId: ownerUserId });
    const agent = await assignNew('For Orbit', { agentId: orbitAgentId, kind: 'agent' });
    await owner.trpc.task.assign.mutate({
        assignee: null,
        expectedVersion: 2,
        serverId,
        taskId: agent.id,
    });
    expect(await sender.sentFor(collapseId(own.id, 2), 0)).toEqual([]);
    expect(await sender.sentFor(collapseId(agent.id, 2), 0)).toEqual([]);
    expect(await sender.sentFor(collapseId(agent.id, 3), 0)).toEqual([]);
});

test('an assignment withdrawn before the push sends stays silent', async () => {
    const { owner, ownerUserId, peerUserId, serverId } = fixture;
    const task = await assignNew('Withdrawn at once', { kind: 'user', userId: peerUserId });
    await sender.sentFor(collapseId(task.id, 2), 1);
    const before = sender.sent.length;
    await owner.trpc.task.assign.mutate({
        assignee: null,
        expectedVersion: 2,
        serverId,
        taskId: task.id,
    });
    await pushTaskAssignments(fixture.database.db, sender, [
        {
            assignedBy: { kind: 'user', userId: ownerUserId },
            serverId,
            taskId: task.id,
            userId: peerUserId,
            version: 2,
        },
    ]);
    expect(sender.sent).toHaveLength(before);
});

describe('several assignments in one grace', () => {
    const assignPeer = async (title: string) => {
        const task = await assignNew(title, { kind: 'user', userId: fixture.peerUserId });
        await sender.sentFor(collapseId(task.id, 2), 1);
        return task;
    };
    const event = (
        taskId: string,
        assignedBy: TaskAssignedEvent['assignedBy'] = {
            kind: 'user',
            userId: fixture.ownerUserId,
        }
    ) => ({
        assignedBy,
        serverId: fixture.serverId,
        taskId,
        userId: fixture.peerUserId,
        version: 2,
    });

    test('collapse to one push that names the count and opens the Inbox', async () => {
        const { peer, serverId } = fixture;
        const tasks = [await assignPeer('First'), await assignPeer('Second')];
        const newest = await assignPeer('Third');
        await pushTaskAssignments(
            fixture.database.db,
            sender,
            [...tasks, newest].map((task) => event(task.id))
        );

        const pushes = await sender.sentFor(`task-burst:${newest.id}:2`, 1);
        expect(pushes.map((push) => push.device.token)).toEqual([boToken]);
        const { count } = await peer.trpc.chat.unreadChatCount.query();
        expect(pushes[0]?.payload).toEqual({
            aps: {
                alert: { body: 'Third and 2 more', title: 'Ada assigned you 3 tasks' },
                badge: count,
                sound: 'default',
                'thread-id': `task-assignments:${serverId}`,
            },
            count: 3,
            kind: 'task_assignment_burst',
            serverId,
        });
        expect(pushTaskAssignmentBurstPayloadSchema.parse(pushes[0]?.payload)).toBeDefined();
    });

    test('name no assigner when there are several', async () => {
        const first = await assignPeer('From Ada');
        const second = await assignPeer('From Orbit');
        await pushTaskAssignments(fixture.database.db, sender, [
            event(first.id),
            event(second.id, { agentId: fixture.orbitAgentId, kind: 'agent' }),
        ]);

        const pushes = await sender.sentFor(`task-burst:${second.id}:2`, 1);
        expect(pushes[0]?.payload.aps.alert.title).toBe('2 tasks assigned to you');
    });

    test('leave only what is still news, and one left is its own push', async () => {
        const { owner, serverId } = fixture;
        const moved = await assignPeer('Reassigned during the grace');
        const left = await assignPeer('Still waiting');
        await owner.trpc.task.assign.mutate({
            assignee: null,
            expectedVersion: 2,
            serverId,
            taskId: moved.id,
        });
        const before = sender.sent.length;

        await pushTaskAssignments(fixture.database.db, sender, [event(moved.id), event(left.id)]);

        const sent = sender.sent.slice(before);
        expect(sent.map((push) => push.collapseId)).toEqual([collapseId(left.id, 2)]);
        expect(sent[0]?.payload.aps.alert.title).toBe(`Ada assigned you ${left.key}`);
    });
});
