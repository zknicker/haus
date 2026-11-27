import { beforeAll, expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();
const loanerId = `cmp_${'l'.repeat(16)}`;

beforeAll(async () => {
    await fixture.harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, health)
        values (${loanerId}, ${fixture.serverId}, ${fixture.ownerUserId}, ${'9'.repeat(64)}, 'healthy')
    `;
});

async function defaultMachine(projectId: string) {
    const projects = await fixture.owner.trpc.project.list.query({ serverId: fixture.serverId });
    return projects.find((project) => project.chatId === projectId)?.defaultMachine;
}

test('a Task started with no Machine runs on its Project default Machine', async () => {
    await fixture.owner.trpc.project.setDefaultMachine.mutate({
        computerId: loanerId,
        projectId: fixture.channelId,
        serverId: fixture.serverId,
    });
    expect(await defaultMachine(fixture.channelId)).toEqual({
        computerId: loanerId,
        computerName: null,
    });

    const { task } = await fixture.owner.trpc.task.start.mutate({
        model: 'gpt-5.6-sol',
        projectId: fixture.channelId,
        prompt: 'Work on the default Machine',
        requestId: 'req-default-machine',
        serverId: fixture.serverId,
    });
    expect(task.computerId).toBe(loanerId);
});

test('a Machine from another Server is refused and leaves the default alone', async () => {
    await expect(
        fixture.owner.trpc.project.setDefaultMachine.mutate({
            computerId: `cmp_${'x'.repeat(16)}`,
            projectId: fixture.channelId,
            serverId: fixture.serverId,
        })
    ).rejects.toThrow('That Machine is not attached to this Server.');
    expect((await defaultMachine(fixture.channelId))?.computerId).toBe(loanerId);
});

test('removing the Machine clears every Project default that names it', async () => {
    await fixture.owner.trpc.computer.remove.mutate({
        computerId: loanerId,
        confirmation: 'REMOVE',
        machineMoves: [],
        serverId: fixture.serverId,
    });
    expect(await defaultMachine(fixture.channelId)).toBeNull();
});
