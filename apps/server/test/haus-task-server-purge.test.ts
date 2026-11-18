import { afterAll, beforeAll, expect, test } from 'bun:test';

import type { HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { taskFixture } from './task-fixture.ts';
import { startTestTask } from './task-place-fixture.ts';

let harness: HausServerHarness;
let owner: HausClient;

beforeAll(async () => {
    harness = await startHausServerHarness();
    owner = await taskFixture(harness).signIn('user_task_purge_owner');
});

afterAll(async () => {
    owner?.close();
    await harness?.close();
});

test('a Server holding real Tasks purges completely', async () => {
    const fixture = taskFixture(harness);
    const agentId = 'agt_task_purge';
    const server = await owner.trpc.server.create.mutate({
        displayName: 'Purged Tasks',
        slug: 'purged-tasks',
    });
    const serverId = server.id;
    const channelId = server.channels[0]?.id ?? '';
    const { client: peer, userId: peerUserId } = await fixture.addMember(
        serverId,
        'user_task_purge_peer'
    );
    await fixture.addAgent(serverId, agentId, 'purge-agent');
    await owner.trpc.taskKey.create.mutate({ key: 'SEC', serverId });
    const label = await owner.trpc.taskLabel.create.mutate({ name: 'Purge', serverId });
    const task = await startTestTask(harness, owner, {
        channelId,
        key: 'SEC',
        serverId,
        title: 'Everything points here',
    });
    await owner.trpc.task.update.mutate({
        expectedVersion: 1,
        patch: { labelIds: [label.label?.id ?? ''] },
        serverId,
        taskId: task.id,
    });
    await owner.trpc.task.assign.mutate({
        assignee: { kind: 'user', userId: peerUserId },
        expectedVersion: 2,
        serverId,
        taskId: task.id,
    });
    const held = await startTestTask(harness, owner, {
        channelId,
        key: 'SEC',
        serverId,
        title: 'Held by an Agent',
    });
    await owner.trpc.task.assign.mutate({
        assignee: { agentId, kind: 'agent' },
        expectedVersion: 1,
        serverId,
        taskId: held.id,
    });
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: `Tracking ${task.key}.`,
        nonce: 'task-purge-link',
        serverId,
    });

    const counts = async () =>
        (await harness.sql`
            select
                (select count(*)::int from task_keys where server_id = ${serverId}) as keys,
                (select count(*)::int from tasks where server_id = ${serverId}) as tasks,
                (select count(*)::int from chats where server_id = ${serverId} and kind = 'task')
                    as task_chats,
                (select count(*)::int from task_label_assignments where server_id = ${serverId})
                    as labels,
                (select count(*)::int from task_message_links where server_id = ${serverId})
                    as message_links,
                (select count(*)::int from task_follows where server_id = ${serverId})
                    as follows
        `) as Record<string, number>[];
    expect(await counts()).toEqual([
        { follows: 1, keys: 2, labels: 1, message_links: 1, task_chats: 2, tasks: 2 },
    ]);

    const { deletionId } = await owner.trpc.server.delete.mutate({
        confirmation: server.slug,
        serverId,
    });
    let status = await owner.trpc.server.deletionStatus.query({ deletionId });
    for (let attempt = 0; attempt < 200 && status.status === 'pending'; attempt += 1) {
        await Bun.sleep(10);
        status = await owner.trpc.server.deletionStatus.query({ deletionId });
    }
    expect(status.status).toBe('completed');
    expect(await counts()).toEqual([
        { follows: 0, keys: 0, labels: 0, message_links: 0, task_chats: 0, tasks: 0 },
    ]);
    peer.close();
});
