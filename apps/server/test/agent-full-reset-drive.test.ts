import { beforeAll, expect, test } from 'bun:test';
import { testSqlAgentHome } from './agent-home.ts';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

const { publish, state } = artifactDriveFixture('full-reset-drive');
const agentId = `agt_${'r'.repeat(16)}`;

beforeAll(async () => {
    const computerId = `cmp_${'r'.repeat(16)}`;
    await state.harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, health)
        values (${computerId}, ${state.serverId}, ${state.actor.member?.id ?? ''},
                ${'f'.repeat(64)}, 'healthy')
    `;
    await state.harness.sql`
        insert into agents (
            id, server_id, computer_id, display_name, handle, home_timezone,
            desired_model_id, desired_runtime_id, home_project_id)
        values (
            ${agentId}, ${state.serverId}, ${computerId}, 'Scout', 'scout', 'UTC',
            'gpt-5.6-sol', 'codex',
            ${await testSqlAgentHome(state.harness.sql, state.serverId)}
        )
    `;
});

test("session reset leaves the Agent's Drive area alone", async () => {
    await publish({ body: 'kept note', path: 'agents/scout/notes/session.md' });

    await state.owner.trpc.agent.reset.mutate({
        agentId,
        kind: 'session',
        serverId: state.serverId,
    });

    expect(await livePaths('agents/scout')).toEqual(['agents/scout/notes/session.md']);
    expect(await deletedPaths('agents/scout')).toEqual([]);
});

test('full reset deletes every live file in the area, each restorable from Recently deleted', async () => {
    const memory = await publish({ body: 'old memory', path: 'agents/scout/MEMORY.md' });
    const note = await publish({ body: 'Acme\n', path: 'agents/scout/notes/leads.md' });
    await publish({ body: 'name: digest\n', path: 'agents/scout/skills/digest/SKILL.md' });
    await publish({ body: 'be kind', path: 'haus/AGENTS.md' });

    await state.owner.trpc.agent.reset.mutate({ agentId, kind: 'full', serverId: state.serverId });

    expect(await livePaths('agents/scout')).toEqual([]);
    expect(await livePaths('haus')).toEqual(['haus/AGENTS.md']);
    expect(await deletedPaths('agents/scout')).toEqual([
        'agents/scout/MEMORY.md',
        'agents/scout/notes/leads.md',
        'agents/scout/notes/session.md',
        'agents/scout/skills/digest/SKILL.md',
    ]);
    const deleted = await state.owner.trpc.artifact.listDeleted.query({
        prefix: 'agents/scout',
        serverId: state.serverId,
    });
    expect(new Set(deleted.deleted.map((item) => JSON.stringify(item.deleted_by)))).toEqual(
        new Set([JSON.stringify({ type: 'user', user_id: state.actor.member?.id })])
    );

    const seeded = await publish({ body: '# Scout\n', path: 'agents/scout/MEMORY.md' });
    expect(seeded.artifact.artifact_id).not.toBe(memory.artifact.artifact_id);
    expect(seeded.artifact.revision_number).toBe(1);

    const restored = await state.owner.trpc.artifact.restore.mutate({
        artifact_id: note.artifact.artifact_id,
        revision_id: note.artifact.revision_id,
        serverId: state.serverId,
    });
    expect(restored.artifact).toMatchObject({
        path: 'agents/scout/notes/leads.md',
        sha256: note.artifact.sha256,
    });
    await expect(
        state.owner.trpc.artifact.restore.mutate({
            artifact_id: memory.artifact.artifact_id,
            revision_id: memory.artifact.revision_id,
            serverId: state.serverId,
        })
    ).rejects.toMatchObject({ data: { artifact: { code: 'PATH_TAKEN' } } });
});

async function livePaths(prefix: string) {
    const listed = await state.owner.trpc.artifact.list.query({
        order: 'path',
        prefix,
        recursive: true,
        serverId: state.serverId,
    });
    return listed.artifacts.map((artifact) => artifact.path);
}

async function deletedPaths(prefix: string) {
    const listed = await state.owner.trpc.artifact.listDeleted.query({
        prefix,
        serverId: state.serverId,
    });
    return listed.deleted.map((item) => item.artifact.path).sort();
}
