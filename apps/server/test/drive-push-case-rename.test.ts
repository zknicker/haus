import { expect, test } from 'bun:test';
import { drivePushFixture } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;

test('a delete under the spelling a case-only rename replaced leaves the renamed file live', async () => {
    const orbit = await push.orbitWriter();
    const report = await push.publish(
        orbit,
        { path: 'haus/case/Report.md', request_id: 'case-seed-report' },
        'report\n'
    );
    const nested = await push.publish(
        orbit,
        { path: 'haus/case/Docs/a.md', request_id: 'case-seed-nested' },
        'nested\n'
    );
    const before = await changes();
    await move('haus/case/Report.md', 'haus/case/report.md');
    await move('haus/case/Docs', 'haus/case/docs');

    const renamed = await changes(before.until);
    expect(
        renamed.changes
            .filter((change) => change.path.startsWith('haus/case/'))
            .map((change) => [change.change, change.path, change.artifact_id])
    ).toEqual([
        ['put', 'haus/case/report.md', report.artifact_id],
        ['put', 'haus/case/docs/a.md', nested.artifact_id],
    ]);

    const run = await push.dispatch('run_case_rename');
    const del = (path: string, revisionId: string, requestId: string) =>
        push.deleteOutcome(run, {
            base_revision_id: revisionId,
            path,
            push_id: 'run_case_rename',
            request_id: requestId,
        });
    expect(await del('haus/case/Report.md', report.revision_id, 'case-delete-report')).toEqual({
        current: null,
        outcome: 'deleted',
        path: 'haus/case/Report.md',
    });
    expect(await del('haus/case/Docs/a.md', nested.revision_id, 'case-delete-nested')).toEqual({
        current: null,
        outcome: 'deleted',
        path: 'haus/case/Docs/a.md',
    });
    const live = await fixture.harness.sql`
        select path from artifacts
        where server_id = ${fixture.serverId} and path like 'haus/case/%' and deleted_at is null
        order by path
    `;
    expect(live).toEqual([{ path: 'haus/case/docs/a.md' }, { path: 'haus/case/report.md' }]);
    expect(await push.close(run, 'run_case_rename')).toEqual([]);
});

function move(from: string, to: string) {
    return fixture.owner.trpc.artifact.move.mutate({ from, serverId: fixture.serverId, to });
}

function changes(since: Record<string, number> = {}) {
    return fixture.owner.trpc.drive.changes.query({ serverId: fixture.serverId, since });
}
