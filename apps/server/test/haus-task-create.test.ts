import { beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
let hausId: string;

beforeAll(async () => {
    const [haus] = (await fixture.harness.sql`
        select id from chats where server_id = ${fixture.serverId} and is_all
    `) as { id: string }[];
    hausId = haus?.id ?? '';
});

function refusedWith(code: string) {
    return expect.objectContaining({ data: expect.objectContaining({ project: { code } }) });
}

async function channelMessageCount(chatId: string) {
    const [row] = (await fixture.harness.sql`
        select count(*)::int as count from chat_messages where chat_id = ${chatId}
    `) as { count: number }[];
    return row?.count;
}

test('a person files an open Task for an Agent with no origin, and nothing posts in the Project', async () => {
    const { harness, owner, serverId } = fixture;
    const before = await channelMessageCount(fixture.channelId);

    const { task } = await owner.trpc.task.create.mutate({
        assigneeAgentId: fixture.orbitAgentId,
        description: 'The nightly export stopped on Tuesday.',
        projectId: fixture.channelId,
        serverId,
        title: 'Restart the nightly export',
    });

    expect(task).toMatchObject({
        assignee: { agentId: fixture.orbitAgentId, kind: 'agent' },
        createdBy: { kind: 'user', userId: fixture.ownerUserId },
        description: 'The nightly export stopped on Tuesday.',
        key: 'PROD-1',
        origin: null,
        projectId: fixture.channelId,
        state: 'open',
        title: 'Restart the nightly export',
        version: 1,
    });
    expect(await channelMessageCount(fixture.channelId)).toBe(before);
    expect(
        await harness.sql`
            select
                (select parent_chat_id from chats where id = ${task.chatId}) as parent,
                (select count(*)::int from task_follows
                    where task_chat_id = ${task.chatId} and user_id = ${fixture.ownerUserId}
                        and followed) as filer,
                (select count(*)::int from agent_task_follows
                    where task_chat_id = ${task.chatId} and agent_id = ${fixture.orbitAgentId}
                        and followed) as assignee,
                (select count(*)::int from agent_inbox
                    where agent_id = ${fixture.orbitAgentId} and source = 'task_assignment'
                        and dedupe_key like ${`%:${task.id}:%`}) as assignments
        `
    ).toEqual([{ assignee: 1, assignments: 1, filer: 1, parent: fixture.channelId }]);
    const page = await owner.trpc.chat.messages.query({ chatId: fixture.channelId, serverId });
    expect(page.tasks.some((preview) => preview.taskId === task.id)).toBe(false);
});

test('filing refuses an unknown Project and a retired Agent', async () => {
    const { owner, serverId } = fixture;
    const filing = { projectId: fixture.channelId, serverId, title: 'Nowhere' };
    await expect(
        owner.trpc.task.create.mutate({
            ...filing,
            assigneeAgentId: fixture.orbitAgentId,
            projectId: 'cht_missing',
        })
    ).rejects.toThrow('That Project does not exist on this Server.');
    await fixture.harness
        .sql`update agents set retired_at = now() where id = ${fixture.peerAgentId}`;
    await expect(
        owner.trpc.task.create.mutate({ ...filing, assigneeAgentId: fixture.peerAgentId })
    ).rejects.toThrow('A task assignee must be an active member or Agent of this Server.');
    await fixture.harness
        .sql`update agents set retired_at = null where id = ${fixture.peerAgentId}`;
});

test('a Project with home Agents refuses archive and delete with PROJECT_HAS_AGENTS', async () => {
    const { harness, owner, serverId } = fixture;
    const ops = await owner.trpc.project.create.mutate({ name: 'ops', serverId });
    await harness.sql`
        update agents set home_project_id = ${ops.chat.id} where id = ${fixture.peerAgentId}
    `;
    const target = { chatId: ops.chat.id, serverId };

    await expect(owner.trpc.chat.archiveChannel.mutate(target)).rejects.toEqual(
        refusedWith('PROJECT_HAS_AGENTS')
    );
    await expect(
        owner.trpc.chat.deleteChannel.mutate({ ...target, confirmation: 'ops' })
    ).rejects.toThrow('This Project is home to @peer. Move them to another Project first.');
    expect(
        (await owner.trpc.project.list.query({ serverId })).find(
            (project) => project.chatId === ops.chat.id
        )?.homeAgentIds
    ).toEqual([fixture.peerAgentId]);

    await harness.sql`update agents set home_project_id = ${hausId} where id = ${fixture.peerAgentId}`;
    await expect(owner.trpc.chat.archiveChannel.mutate(target)).resolves.toMatchObject({
        chatId: ops.chat.id,
    });
});

test('the Haus project’s channel cannot be renamed', async () => {
    const { owner, serverId } = fixture;
    await expect(
        owner.trpc.project.update.mutate({ chatId: hausId, name: 'lobby', serverId })
    ).rejects.toEqual(refusedWith('PROJECT_NAME_FIXED'));
    const renamedDescription = await owner.trpc.project.update.mutate({
        chatId: hausId,
        description: 'Everyone',
        name: 'haus',
        serverId,
    });
    expect(renamedDescription.chat).toMatchObject({ description: 'Everyone', name: 'haus' });
});
