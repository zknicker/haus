import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

function appCreate(homeProjectId: string, handle: string) {
    return fixture.owner.trpc.agent.create.mutate({
        computerId: fixture.computerId,
        displayName: handle,
        handle,
        homeProjectId,
        modelId: 'gpt-5.6-sol',
        runtimeId: 'codex',
        serverId: fixture.serverId,
    });
}

async function homeOf(agentId: string) {
    const [row] = (await fixture.harness.sql`
        select home_project_id from agents where id = ${agentId}
    `) as { home_project_id: string | null }[];
    return row?.home_project_id;
}

test('the App homes a new Agent in an open Project and refuses #all, archived and unknown ones', async () => {
    const created = await appCreate(fixture.channelId, 'homed');
    expect(await homeOf(created.agent.id)).toBe(fixture.channelId);

    const [all] = (await fixture.harness.sql`
        select id from chats where server_id = ${fixture.serverId} and is_all
    `) as { id: string }[];
    const archived = await fixture.owner.trpc.project.create.mutate({
        name: 'shelved',
        serverId: fixture.serverId,
    });
    await fixture.harness
        .sql`update chats set archived_at = now(), archived_by_user_id = ${fixture.ownerUserId} where id = ${archived.chat.id}`;
    const refusal = 'Its home must be an open Project on this Server, and #all is not a Project.';
    for (const [homeProjectId, handle] of [
        [all?.id ?? '', 'in-all'],
        [archived.chat.id, 'in-archive'],
        ['cht_missingproject00', 'in-nowhere'],
    ] as const) {
        await expect(appCreate(homeProjectId, handle)).rejects.toThrow(refusal);
    }
    expect(
        await fixture.harness.sql`
            select handle from agents where handle in ('in-all', 'in-archive', 'in-nowhere')
        `
    ).toEqual([]);
});

test('an Agent-created Agent lives in its creator’s home, and creation refuses when that home is closed', async () => {
    const runner = await fixture.mintRunner('run_create_home_project');
    const creatorHome = await homeOf(fixture.orbitAgentId);
    const created = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Lodger', nonce: 'create-home-project' })
    );
    expect(created.status).toBe(200);
    expect(await homeOf(created.body.agent?.agentId ?? '')).toBe(creatorHome);

    await fixture.harness
        .sql`update chats set archived_at = now(), archived_by_user_id = ${fixture.ownerUserId} where id = ${creatorHome}`;
    const refused = await fixture.postCreate(
        runner,
        fixture.createBody({ displayName: 'Drifter', nonce: 'create-home-closed' })
    );
    await fixture.harness
        .sql`update chats set archived_at = null, archived_by_user_id = null where id = ${creatorHome}`;
    expect(refused.status).not.toBe(200);
    expect(JSON.stringify(refused.body)).toContain('Your home is not an open Project');
});
