import { afterAll, beforeAll, expect, test } from 'bun:test';
import { pushIssuePayloadSchema } from '@haus/api';
import { type NotificationFixture, startNotificationFixture } from './notification-fixture.ts';
import { createTestProject } from './project.fixture.ts';
import { deviceToken, FakePushSender } from './push-fake-sender.ts';

const sender = new FakePushSender();
const adaToken = deviceToken('c6');
const boToken = deviceToken('d7');
let fixture: NotificationFixture;
let projectId: string;

beforeAll(async () => {
    fixture = await startNotificationFixture({ pushReadGraceMs: 0, pushSender: sender });
    for (const [client, token] of [
        [fixture.owner, adaToken],
        [fixture.peer, boToken],
    ] as const) {
        await client.trpc.push.registerDevice.mutate({
            bundleId: 'chat.haus.ios',
            environment: 'sandbox',
            token,
        });
    }
    projectId = (
        await createTestProject(fixture.owner, {
            key: 'OPS',
            name: 'ops-pushes',
            serverId: fixture.serverId,
        })
    ).id;
});

afterAll(async () => {
    await fixture.close();
});

test('assigning a person an Issue pushes them, and assigning yourself does not', async () => {
    const { owner, ownerUserId, peer, peerUserId, serverId } = fixture;
    const { issue } = await owner.trpc.issue.create.mutate({
        assignee: { kind: 'user', userId: peerUserId },
        projectId,
        serverId,
        title: 'Rotate the signing key',
    });

    const pushes = await sender.sentFor(`issue-assign:${issue.id}:1`, 1);
    expect(pushes.map((push) => push.device.token)).toEqual([boToken]);
    const { count } = await peer.trpc.chat.unreadChatCount.query();
    expect(pushes[0]?.payload).toEqual({
        aps: {
            alert: { body: 'Rotate the signing key', title: `Ada assigned you ${issue.code}` },
            badge: count,
            sound: 'default',
            'thread-id': issue.id,
        },
        code: issue.code,
        issueId: issue.id,
        kind: 'issue_assignment',
        serverId,
    });
    expect(pushIssuePayloadSchema.parse(pushes[0]?.payload)).toBeDefined();

    const own = await owner.trpc.issue.create.mutate({
        assignee: { kind: 'user', userId: ownerUserId },
        projectId,
        serverId,
        title: 'My own work',
    });
    expect(await sender.sentFor(`issue-assign:${own.issue.id}:1`, 0)).toEqual([]);
});

test('a comment pushes every subscriber but its author', async () => {
    const { owner, peer, peerUserId, serverId } = fixture;
    const { issue } = await owner.trpc.issue.create.mutate({
        assignee: { kind: 'user', userId: peerUserId },
        projectId,
        serverId,
        title: 'Audit the deploy keys',
    });
    const { comment } = await peer.trpc.issue.comment.mutate({
        body: 'Two keys are still live.',
        issueId: issue.id,
        serverId,
    });

    const pushes = await sender.sentFor(comment.id, 1);
    expect(pushes.map((push) => push.device.token)).toEqual([adaToken]);
    expect(pushes[0]?.payload).toMatchObject({
        aps: { alert: { body: 'Two keys are still live.', title: `Bo commented on ${issue.code}` } },
        kind: 'issue_comment',
    });
});
