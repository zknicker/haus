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
    await owner.trpc.project.create.mutate({ key: 'SEC', name: 'security', serverId });
    const task = await startTestTask(harness, owner, {
        channelId,
        serverId,
        title: 'Everything points here',
    });
    await harness.sql`
        insert into task_follows (server_id, task_chat_id, task_chat_kind, user_id, followed)
        values (${serverId}, ${task.chatId}, 'task', ${peerUserId}, true)
    `;
    await startTestTask(harness, owner, { channelId, serverId, title: 'A second one' });
    await owner.trpc.chat.send.mutate({
        chatId: channelId,
        content: `Tracking [it](task://${task.id}).`,
        nonce: 'task-purge-link',
        serverId,
    });

    const counts = async () =>
        (await harness.sql`
            select
                (select count(*)::int from task_keys where server_id = ${serverId}) as keys,
                (select count(*)::int from projects where server_id = ${serverId}) as projects,
                (select count(*)::int from tasks where server_id = ${serverId}) as tasks,
                (select count(*)::int from chats where server_id = ${serverId} and kind = 'task')
                    as task_chats,
                (select count(*)::int from task_message_links where server_id = ${serverId})
                    as message_links,
                (select count(*)::int from task_follows where server_id = ${serverId})
                    as follows
        `) as Record<string, number>[];
    expect(await counts()).toEqual([
        {
            follows: 1,
            keys: 2,
            message_links: 1,
            projects: 2,
            task_chats: 2,
            tasks: 2,
        },
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
        {
            follows: 0,
            keys: 0,
            message_links: 0,
            projects: 0,
            task_chats: 0,
            tasks: 0,
        },
    ]);
    peer.close();
});
