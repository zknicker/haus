import { expect, test } from 'bun:test';
import { drivePushFixture, expectOutcome } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;

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
});
