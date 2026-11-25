import { expect, test } from 'bun:test';
import { drivePushFixture, expectOutcome } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;

test('an edit to a file a person moved keeps both and lists the conflict instead of splitting it', async () => {
    const orbit = await push.orbitWriter();
    const seed = await push.publish(
        orbit,
        { path: 'haus/moves/a.md', request_id: 'moved-seed' },
        'title\nalpha\n'
    );
    await fixture.owner.trpc.artifact.move.mutate({
        from: 'haus/moves/a.md',
        serverId: fixture.serverId,
        to: 'haus/moves/b.md',
    });

    const run = await push.dispatch('run_moved_base');
    const kept = expectOutcome(
        await push.putOutcome(
            run,
            {
                base_revision_id: seed.revision_id,
                path: 'haus/moves/a.md',
                push_id: 'run_moved_base',
                request_id: 'moved-edit',
            },
            'title\nalpha\nedited\n'
        ),
        'kept_both'
    );
    expect(kept).toMatchObject({
        copy: { path: 'haus/moves/a.conflict-orbit.md' },
        current: { artifact_id: seed.artifact_id, path: 'haus/moves/b.md' },
        reason: 'base_gone',
    });
    const live = await fixture.harness.sql`
        select path from artifacts
        where server_id = ${fixture.serverId} and path like 'haus/moves/%' and deleted_at is null
        order by path
    `;
    expect(live).toEqual([{ path: 'haus/moves/a.conflict-orbit.md' }, { path: 'haus/moves/b.md' }]);
    expect(await push.close(run, 'run_moved_base')).toMatchObject([
        {
            copyPath: 'haus/moves/a.conflict-orbit.md',
            outcome: 'kept_both',
            path: 'haus/moves/a.md',
        },
    ]);
});
