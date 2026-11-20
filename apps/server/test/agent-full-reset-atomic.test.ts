import { expect, test } from 'bun:test';
import { drivePushFixture } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;

test('a full reset that fails partway commits nothing, Drive deletes included', async () => {
    const runner = await push.dispatch('run_live');
    const kept = await push.publish(
        runner,
        { path: 'agents/orbit/notes/kept.md', request_id: 'atomic-kept' },
        'kept\n'
    );
    await fixture.harness.sql`
        insert into agent_delivery (
            agent_id, server_id, active_run_id, active_run_chat_id, active_run_computer_id,
            active_run_runtime_id, active_run_model_id, active_run_reasoning_effort)
        values (
            ${fixture.orbitAgentId}, ${fixture.serverId}, 'run_live', ${fixture.channelId},
            ${fixture.computerId}, 'codex', 'gpt-5.6-sol', 'medium')
        on conflict (agent_id) do update set
            active_run_id = excluded.active_run_id,
            active_run_chat_id = excluded.active_run_chat_id,
            active_run_computer_id = excluded.active_run_computer_id,
            active_run_runtime_id = excluded.active_run_runtime_id,
            active_run_model_id = excluded.active_run_model_id,
            active_run_reasoning_effort = excluded.active_run_reasoning_effort
    `;
    await fixture.harness.sql`
        create function fail_session_rotation() returns trigger language plpgsql as $$
        begin raise exception 'rotation refused for the test'; end $$
    `;
    await fixture.harness.sql`
        create trigger fail_session_rotation before insert on agent_session_rotations
        for each row execute function fail_session_rotation()
    `;
    const before = await agentState();

    await expect(
        fixture.owner.trpc.agent.reset.mutate({
            agentId: fixture.orbitAgentId,
            kind: 'full',
            serverId: fixture.serverId,
        })
    ).rejects.toThrow();

    expect(await agentState()).toEqual(before);
    expect(before).toMatchObject({ active_run_id: 'run_live', full_reset_at: null });
    const live = await fixture.owner.trpc.artifact.list.query({
        prefix: 'agents/orbit',
        recursive: true,
        serverId: fixture.serverId,
    });
    expect(live.artifacts.map((artifact) => artifact.artifact_id)).toEqual([kept.artifact_id]);
    const [credentials] = await fixture.harness.sql`
        select count(*)::int as revoked from agent_runner_credentials
        where agent_id = ${fixture.orbitAgentId} and run_id = 'run_live' and revoked_at is not null
    `;
    expect(credentials).toEqual({ revoked: 0 });

    await fixture.harness.sql`drop trigger fail_session_rotation on agent_session_rotations`;
    await fixture.owner.trpc.agent.reset.mutate({
        agentId: fixture.orbitAgentId,
        kind: 'full',
        serverId: fixture.serverId,
    });
    expect(await agentState()).toMatchObject({
        active_run_id: null,
        session_generation: (before?.session_generation as number) + 1,
    });
});

async function agentState() {
    const [row] = (await fixture.harness.sql`
        select a.session_generation, a.session_reset_kind, a.full_reset_at, d.active_run_id
        from agents a left join agent_delivery d on d.agent_id = a.id
        where a.id = ${fixture.orbitAgentId}
    `) as Record<string, unknown>[];
    return row;
}
