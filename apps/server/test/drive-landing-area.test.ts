import { expect, test } from 'bun:test';
import { drivePushFixture } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture, storage } = push;

test('a write lands nowhere once its file moved into an area the writer cannot write', async () => {
    const orbit = await push.orbitWriter();
    const first = await push.publish(
        orbit,
        { path: 'haus/landing/plan.md', request_id: 'landing-first' },
        'one\n'
    );
    const hold = storage.holdNextUpload();
    const edit = push.publishResponse(
        orbit,
        {
            base_revision_id: first.revision_id,
            path: 'haus/landing/plan.md',
            request_id: 'landing-edit',
        },
        'two\n'
    );
    await hold.started;
    await fixture.owner.trpc.artifact.move.mutate({
        from: 'haus/landing/plan.md',
        serverId: fixture.serverId,
        to: 'agents/peer/plan.md',
    });
    hold.release();

    expect(await edit).toEqual({
        body: {
            code: 'FORBIDDEN',
            message:
                '`agents/peer` belongs to another Agent. An Agent writes `haus/`, Projects, and its own `agents/<handle>/`.',
        },
        status: 403,
    });
    expect(
        await fixture.harness.sql`
            select a.path, a.current_revision_id, r.state, r.reserved_bytes::int as reserved
            from artifacts a join artifact_revisions r on r.artifact_id = a.id
            where r.request_id = 'landing-edit'
        `
    ).toEqual([
        {
            current_revision_id: first.revision_id,
            path: 'agents/peer/plan.md',
            reserved: 0,
            state: 'failed',
        },
    ]);
});

test('a pushed file is refused once its area passed to another Agent during the upload', async () => {
    const drifterId = await fixture.createAgent('Drifter', 'drifter');
    const run = await push.dispatch('run_landing_drifter', { agentId: drifterId });
    const hold = storage.holdNextUpload();
    const pushed = push.put(
        run,
        {
            path: 'agents/drifter/notes.md',
            push_id: 'run_landing_drifter',
            request_id: 'landing-drifter',
        },
        'mine\n'
    );
    await hold.started;
    await fixture.harness.sql`update agents set retired_at = now() where id = ${drifterId}`;
    await fixture.createAgent('Heir', 'drifter');
    hold.release();

    expect(await pushed).toEqual({
        body: {
            code: 'FORBIDDEN',
            current: null,
            message:
                '`agents/drifter` belongs to another Agent. An Agent writes `haus/`, Projects, and its own `agents/<handle>/`.',
            outcome: 'refused',
            path: 'agents/drifter/notes.md',
        },
        status: 200,
    });
    expect(await push.countRows('artifact_revisions', 'agents/drifter/')).toBe(0);
});
