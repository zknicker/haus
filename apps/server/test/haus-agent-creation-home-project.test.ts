import { expect, test } from 'bun:test';
import { agentCreationFixture } from './agent-creation-fixture.ts';

const fixture = agentCreationFixture();

async function homeOf(agentId: string) {
    const [row] = (await fixture.harness.sql`
        select home_project_id from agents where id = ${agentId}
    `) as { home_project_id: string | null }[];
    return row?.home_project_id;
}

test('an Agent-created Agent lives in its creator’s home, and creation refuses when that home is closed', async () => {
    const runner = await fixture.mintRunner('run_create_home_project');
    const creatorHome = (
        await fixture.owner.trpc.project.create.mutate({
            name: 'lodge',
            serverId: fixture.serverId,
        })
    ).chat.id;
    await fixture.harness.sql`
        update agents set home_project_id = ${creatorHome} where id = ${fixture.orbitAgentId}
    `;
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
    await fixture.harness.sql`
        update agents set home_project_id = ${fixture.channelId} where id = ${fixture.orbitAgentId}
    `;
    expect(refused.status).not.toBe(200);
    expect(JSON.stringify(refused.body)).toContain('Your Project is not open');
});
