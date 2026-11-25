import { expect, test } from 'bun:test';
import { hasMovedFileGuard } from '../src/drive/push/moved-file-guard.ts';
import { drivePushFixture, expectOutcome } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;

async function reportComputerVersion(version: string | null) {
    await fixture.harness.sql`
        update computers set product_version = ${version} where id = ${fixture.computerId}
    `;
}

async function editAfterMove(folder: string, runId: string, computerVersion: string | null) {
    const orbit = await push.orbitWriter();
    const seed = await push.publish(
        orbit,
        { path: `haus/${folder}/a.md`, request_id: `${runId}-seed` },
        'title\nalpha\n'
    );
    await fixture.owner.trpc.artifact.move.mutate({
        from: `haus/${folder}/a.md`,
        serverId: fixture.serverId,
        to: `haus/${folder}/b.md`,
    });
    await reportComputerVersion(computerVersion);
    const run = await push.dispatch(runId);
    const outcome = await push.putOutcome(
        run,
        {
            base_revision_id: seed.revision_id,
            path: `haus/${folder}/a.md`,
            push_id: runId,
            request_id: `${runId}-edit`,
        },
        'title\nalpha\nedited\n'
    );
    const live = await fixture.harness.sql`
        select path from artifacts
        where server_id = ${fixture.serverId} and path like ${`haus/${folder}/%`}
          and deleted_at is null
        order by path
    `;
    return { live, outcome, run, seed };
}

test('an edit to a file a person moved keeps both and lists the conflict instead of splitting it', async () => {
    const { live, outcome, run, seed } = await editAfterMove('moves', 'run_moved_base', '26.0.3');

    expect(expectOutcome(outcome, 'kept_both')).toMatchObject({
        copy: { path: 'haus/moves/a.conflict-orbit.md' },
        current: { artifact_id: seed.artifact_id, path: 'haus/moves/b.md' },
        reason: 'base_gone',
    });
    expect(live).toEqual([{ path: 'haus/moves/a.conflict-orbit.md' }, { path: 'haus/moves/b.md' }]);
    expect(await push.close(run, 'run_moved_base')).toMatchObject([
        {
            copyPath: 'haus/moves/a.conflict-orbit.md',
            outcome: 'kept_both',
            path: 'haus/moves/a.md',
        },
    ]);
});

test('a Computer without the moved-file guard still gets the edit as a new file at its path', async () => {
    const { live, outcome } = await editAfterMove('old-moves', 'run_moved_old', '26.0.2');

    expect(expectOutcome(outcome, 'committed')).toMatchObject({
        current: { path: 'haus/old-moves/a.md' },
    });
    expect(live).toEqual([{ path: 'haus/old-moves/a.md' }, { path: 'haus/old-moves/b.md' }]);
});

test('only a Computer newer than 26.0.2 has the moved-file guard', () => {
    expect(hasMovedFileGuard(null)).toBe(false);
    expect(hasMovedFileGuard('dev')).toBe(false);
    expect(hasMovedFileGuard('26.0.2')).toBe(false);
    expect(hasMovedFileGuard('25.9.9')).toBe(false);
    expect(hasMovedFileGuard('26.0.3')).toBe(true);
    expect(hasMovedFileGuard('26.1.0')).toBe(true);
    expect(hasMovedFileGuard('27.0.0')).toBe(true);
});
