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

test('a person files a Task with no origin, wakes nobody, and nothing posts in the Project', async () => {
    const { harness, owner, serverId } = fixture;
    const before = await channelMessageCount(fixture.channelId);

    const { task } = await owner.trpc.task.create.mutate({
        description: 'The nightly export stopped on Tuesday.',
        projectId: fixture.channelId,
        serverId,
        title: 'Restart the nightly export',
    });

    expect(task).toMatchObject({
        archivedAt: null,
        createdBy: { kind: 'user', userId: fixture.ownerUserId },
        description: 'The nightly export stopped on Tuesday.',
        origin: null,
        projectId: fixture.channelId,
        shortId: expect.stringMatching(/^[0-9a-hjkmnp-tv-z]{8}$/u),
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
                (select count(*)::int from agent_inbox
                    where agent_id = ${fixture.orbitAgentId} and source = 'task_assignment')
                    as assignments
        `
    ).toEqual([{ assignments: 0, filer: 1, parent: fixture.channelId }]);
    const page = await owner.trpc.chat.messages.query({ chatId: fixture.channelId, serverId });
    expect(page.tasks.some((preview) => preview.taskId === task.id)).toBe(false);
});

test('filing refuses an unknown Project', async () => {
    const { owner, serverId } = fixture;
    await expect(
        owner.trpc.task.create.mutate({ projectId: 'cht_missing', serverId, title: 'Nowhere' })
    ).rejects.toThrow('That Project does not exist on this Server.');
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
    ).rejects.toThrow('Captains live in this Project: @peer. Move them to another Project first.');
    expect(
        (await owner.trpc.project.list.query({ serverId })).find(
            (project) => project.chatId === ops.chat.id
        )?.homeAgentIds
    ).toEqual([fixture.peerAgentId]);

    await harness.sql`update agents set home_project_id = ${fixture.channelId} where id = ${fixture.peerAgentId}`;
    await expect(owner.trpc.chat.archiveChannel.mutate(target)).resolves.toMatchObject({
        chatId: ops.chat.id,
    });
});

test('the Haus project’s channel cannot be renamed', async () => {
    const { owner, serverId } = fixture;
    await expect(
        owner.trpc.chat.updateAllChannel.mutate({ chatId: hausId, name: 'lobby', serverId })
    ).rejects.toEqual(refusedWith('PROJECT_NAME_FIXED'));
    const renamedDescription = await owner.trpc.chat.updateAllChannel.mutate({
        chatId: hausId,
        description: 'Everyone',
        name: 'all',
        serverId,
    });
    expect(renamedDescription.chat).toMatchObject({ description: 'Everyone', name: 'all' });
});
