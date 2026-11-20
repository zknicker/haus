import { expect, test } from 'bun:test';
import { drivePushFixture, expectOutcome } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture, storage } = push;

test('a push from a run dispatched before a full reset cannot bring a deleted file back', async () => {
    const before = await push.dispatch('run_before_reset');
    const memory = expectOutcome(
        await push.putOutcome(
            before,
            {
                path: 'agents/orbit/MEMORY.md',
                push_id: 'run_before_reset',
                request_id: 'pre-memory',
            },
            'old memory\n'
        ),
        'committed'
    );

    await fixture.owner.trpc.agent.reset.mutate({
        agentId: fixture.orbitAgentId,
        kind: 'full',
        serverId: fixture.serverId,
    });

    const stale = await push.putOutcome(
        before,
        {
            base_revision_id: memory.current.revision_id,
            path: 'agents/orbit/MEMORY.md',
            push_id: 'run_before_reset',
            request_id: 'stale-memory',
        },
        'stale edit\n'
    );
    expect(stale).toMatchObject({ code: 'AGENT_RESET', current: null, outcome: 'refused' });
    const created = await push.putOutcome(
        before,
        { path: 'agents/orbit/notes/new.md', push_id: 'run_before_reset', request_id: 'stale-new' },
        'stale note\n'
    );
    expect(created).toMatchObject({ code: 'AGENT_RESET', outcome: 'refused' });
    expect(await push.close(before, 'run_before_reset')).toEqual([]);
    expect(await push.conflictItems(fixture.orbitAgentId)).toEqual([]);
    expect(await push.countRows('artifacts', 'agents/orbit/notes/')).toBe(0);
    const live = await fixture.owner.trpc.artifact.list.query({
        prefix: 'agents/orbit',
        recursive: true,
        serverId: fixture.serverId,
    });
    expect(live.artifacts).toEqual([]);

    const after = await push.dispatch('run_after_reset');
    const seeded = await push.putOutcome(
        after,
        { path: 'agents/orbit/MEMORY.md', push_id: 'run_after_reset', request_id: 'post-memory' },
        '# Orbit\n'
    );
    expect(seeded).toMatchObject({ outcome: 'committed', path: 'agents/orbit/MEMORY.md' });
    expect(
        await fixture.harness.sql`
            select p.id, p.reset_generation as push, a.reset_generation as agent
            from drive_pushes p join agents a on a.id = p.agent_id
            where p.agent_id = ${fixture.orbitAgentId} order by p.id
        `
    ).toEqual([
        { agent: 1, id: 'run_after_reset', push: 1 },
        { agent: 1, id: 'run_before_reset', push: 0 },
    ]);
});

test('a put reserved before a full reset lands nowhere and leaves no gap in the numbers', async () => {
    const before = await push.dispatch('run_landing_before');
    const first = expectOutcome(
        await push.putOutcome(
            before,
            { path: 'haus/reset/plan.md', push_id: 'run_landing_before', request_id: 'land-one' },
            'one\n'
        ),
        'committed'
    );
    const hold = storage.holdNextUpload();
    const stale = push.putOutcome(
        before,
        {
            base_revision_id: first.current.revision_id,
            path: 'haus/reset/plan.md',
            push_id: 'run_landing_before',
            request_id: 'land-stale',
        },
        'stale\n'
    );
    await hold.started;
    await fixture.owner.trpc.agent.reset.mutate({
        agentId: fixture.orbitAgentId,
        kind: 'full',
        serverId: fixture.serverId,
    });
    hold.release();

    expect(await stale).toMatchObject({ code: 'AGENT_RESET', outcome: 'refused' });
    const after = await push.dispatch('run_landing_after');
    const next = expectOutcome(
        await push.putOutcome(
            after,
            {
                base_revision_id: first.current.revision_id,
                path: 'haus/reset/plan.md',
                push_id: 'run_landing_after',
                request_id: 'land-two',
            },
            'two\n'
        ),
        'committed'
    );
    const { versions } = await fixture.owner.trpc.artifact.versions.query({
        artifact_id: first.current.artifact_id,
        serverId: fixture.serverId,
    });
    expect(versions.map((version) => [version.revision_number, version.revision_id])).toEqual([
        [2, next.current.revision_id],
        [1, first.current.revision_id],
    ]);
});
