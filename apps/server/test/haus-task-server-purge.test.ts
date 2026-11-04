import { afterAll, beforeAll, expect, test } from 'bun:test';
import type { HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';
import { taskFixture } from './task-fixture.ts';

/**
 * Purging a Server cascades through boards, columns, Tasks, and everything that
 * points at them in one statement, so the restricted column and creator links
 * must all hold until commit (0002's rule).
 */
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
    const { client: peer, userId: peerUserId } = await fixture.addMember(
        serverId,
        'user_task_purge_peer'
    );
    await fixture.addAgent(serverId, agentId, 'purge-agent');
    const { board } = await owner.trpc.board.create.mutate({
        key: 'SEC',
        name: 'Security',
        serverId,
    });
    const label = await owner.trpc.taskLabel.create.mutate({ name: 'Purge', serverId });
    const { task } = await owner.trpc.task.create.mutate({
        assignee: { kind: 'user', userId: peerUserId },
        boardId: board.id,
        labelIds: [label.label.id],
        serverId,
        title: 'Everything points here',
    });
    await owner.trpc.task.create.mutate({
        assignee: { agentId, kind: 'agent' },
        boardId: board.id,
        serverId,
        title: 'Held by an Agent',
    });
    await owner.trpc.chat.send.mutate({
        chatId: server.channels[0]?.id ?? '',
        content: `Tracking ${task.key}.`,
        nonce: 'task-purge-link',
        serverId,
    });

    const counts = async () =>
        (await harness.sql`
            select
                (select count(*)::int from boards where server_id = ${serverId}) as boards,
                (select count(*)::int from board_columns where server_id = ${serverId}) as columns,
                (select count(*)::int from tasks where server_id = ${serverId}) as tasks,
                (select count(*)::int from task_label_assignments where server_id = ${serverId})
                    as labels,
                (select count(*)::int from task_message_links where server_id = ${serverId})
                    as message_links,
                (select count(*)::int from task_inbox_items where server_id = ${serverId})
                    as inbox_items
        `) as Record<string, number>[];
    expect(await counts()).toEqual([
        { boards: 2, columns: 10, inbox_items: 1, labels: 1, message_links: 1, tasks: 2 },
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
        { boards: 0, columns: 0, inbox_items: 0, labels: 0, message_links: 0, tasks: 0 },
    ]);
    peer.close();
});
