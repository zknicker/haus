import { beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
const studioId = `cmp_${'t'.repeat(16)}`;

function startOn(input: { computerId: string; projectId: string; requestId: string }) {
    return fixture.owner.trpc.task.start.mutate({
        ...input,
        model: 'gpt-5.6-sol',
        prompt: `Work for ${input.requestId}`,
        serverId: fixture.serverId,
    });
}

async function agentRow(agentId: string) {
    const [row] = (await fixture.harness.sql`
        select computer_id, retired_at, session_generation,
            (select count(*)::int from agent_inbox where agent_id = agents.id) as inbox
        from agents where id = ${agentId}
    `) as {
        computer_id: string | null;
        inbox: number;
        retired_at: Date | null;
        session_generation: number;
    }[];
    return row;
}

beforeAll(async () => {
    await fixture.harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, health)
        values (${studioId}, ${fixture.serverId}, ${fixture.ownerUserId}, ${'7'.repeat(64)}, 'healthy')
    `;
});

test('removing a Machine archives its Tasks, keeps their agents out of the moves, and frees it', async () => {
    const { task } = await startOn({
        computerId: studioId,
        projectId: fixture.channelId,
        requestId: 'req-removal-studio',
    });
    const before = await agentRow(task.agentId ?? '');

    await fixture.owner.trpc.computer.remove.mutate({
        computerId: studioId,
        confirmation: 'REMOVE',
        machineMoves: [],
        serverId: fixture.serverId,
    });

    const after = await fixture.owner.trpc.task.get.query({
        serverId: fixture.serverId,
        taskId: task.id,
    });
    expect(after).toMatchObject({ computerId: null });
    expect(after.archivedAt).not.toBeNull();
    expect(await agentRow(task.agentId ?? '')).toMatchObject({
        computer_id: null,
        inbox: 0,
        session_generation: (before?.session_generation ?? 0) + 1,
    });
    await expect(
        fixture.owner.trpc.task.unarchive.mutate({
            expectedVersion: after.version,
            serverId: fixture.serverId,
            taskId: task.id,
        })
    ).rejects.toThrow('Machine was removed');
});

test('deleting a Project stops its Task sessions before their agents retire', async () => {
    const project = await fixture.owner.trpc.project.create.mutate({
        key: 'TMP',
        name: 'scratch',
        serverId: fixture.serverId,
    });
    const { task } = await startOn({
        computerId: fixture.computerId,
        projectId: project.chat.id,
        requestId: 'req-removal-project',
    });
    const before = await agentRow(task.agentId ?? '');

    await fixture.owner.trpc.chat.deleteChannel.mutate({
        chatId: project.chat.id,
        confirmation: 'scratch',
        serverId: fixture.serverId,
    });

    const after = await agentRow(task.agentId ?? '');
    expect(after?.retired_at).not.toBeNull();
    expect(after).toMatchObject({
        inbox: 0,
        session_generation: (before?.session_generation ?? 0) + 1,
    });
    expect(await fixture.harness.sql`select id from tasks where id = ${task.id}`).toEqual([]);
});
