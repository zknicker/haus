import { expect, test } from 'bun:test';
import { drivePushFixture, expectOutcome } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;
const laptopId = `cmp_${'m'.repeat(16)}`;

test('a push from the old Machine that lands after a Machine change writes nothing', async () => {
    const before = await push.dispatch('run_before_move');
    const memory = expectOutcome(
        await push.putOutcome(
            before,
            { path: 'agents/orbit/MEMORY.md', push_id: 'run_before_move', request_id: 'pre-move' },
            'before the move\n'
        ),
        'committed'
    );
    await fixture.harness.sql`
        insert into computers (id, server_id, attached_by_user_id, credential_hash, reported_inventory, health)
        select ${laptopId}, server_id, attached_by_user_id, repeat('e', 64), reported_inventory, 'healthy'
        from computers where id = ${fixture.computerId}
    `;

    expect(
        await fixture.owner.trpc.agent.setMachine.mutate({
            agentId: fixture.orbitAgentId,
            computerId: laptopId,
            fromLastSynced: true,
            serverId: fixture.serverId,
        })
    ).toMatchObject({ change: null, computerId: laptopId });

    const stale = await push.putOutcome(
        before,
        {
            base_revision_id: memory.current.revision_id,
            path: 'agents/orbit/MEMORY.md',
            push_id: 'run_before_move',
            request_id: 'post-move',
        },
        'written on the old Mac after the move\n'
    );
    expect(stale).toMatchObject({ code: 'AGENT_MOVED', outcome: 'refused' });
    const created = await push.putOutcome(
        before,
        { path: 'agents/orbit/notes/late.md', push_id: 'run_before_move', request_id: 'late-note' },
        'late note\n'
    );
    expect(created).toMatchObject({ code: 'AGENT_MOVED', outcome: 'refused' });
    expect(await push.close(before, 'run_before_move')).toEqual([]);
    expect(await push.conflictItems(fixture.orbitAgentId)).toEqual([]);
    expect(await push.countRows('artifacts', 'agents/orbit/notes/')).toBe(0);
});
