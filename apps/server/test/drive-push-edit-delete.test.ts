import { expect, test } from 'bun:test';
import { drivePushFixture, expectOutcome } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;
const base = 'title\nalpha\nbeta\n';
const { orbitWriter, peerWriter } = push;

test('an edit beats a delete on either side, and a delete of another file leaves it alone', async () => {
    const orbit = await orbitWriter();
    const peer = await peerWriter();
    const gone = await push.publish(
        orbit,
        { path: 'haus/edit/gone.md', request_id: 'edit-seed-gone' },
        base
    );
    const removed = await push.postJson(
        peer,
        `/api/agent/artifacts/${gone.artifact_id}/delete`,
        {}
    );
    expect(removed.status).toBe(200);
    const kept = await push.publish(
        orbit,
        { path: 'haus/edit/kept.md', request_id: 'edit-seed-kept' },
        base
    );
    const peerKept = await push.publish(
        peer,
        {
            base_revision_id: kept.revision_id,
            path: 'haus/edit/kept.md',
            request_id: 'edit-peer-kept',
        },
        'title\nalpha\nBETA\n'
    );
    const plain = await push.publish(
        orbit,
        { path: 'haus/edit/plain.md', request_id: 'edit-seed-plain' },
        base
    );
    const old = await push.publish(
        orbit,
        { path: 'haus/edit/other.md', request_id: 'edit-seed-other' },
        base
    );
    await push.postJson(orbit, `/api/agent/artifacts/${old.artifact_id}/delete`, {});
    const other = await push.publish(
        peer,
        { path: 'haus/edit/other.md', request_id: 'edit-peer-other' },
        'new\n'
    );

    const run = await push.dispatch('run_edit_delete');
    const revived = expectOutcome(
        await push.putOutcome(
            run,
            {
                base_revision_id: gone.revision_id,
                path: 'haus/edit/gone.md',
                push_id: 'run_edit_delete',
                request_id: 'edit-gone-put',
            },
            'title\nalpha\nedited\n'
        ),
        'kept_edit'
    );
    expect(revived).toMatchObject({
        current: { artifact_id: gone.artifact_id, author: { agent_id: fixture.orbitAgentId } },
        path: 'haus/edit/gone.md',
        reason: 'edit_over_delete',
    });
    expect(await push.revision(revived.current.revision_id)).toMatchObject({
        artifact_id: gone.artifact_id,
        base_revision_id: gone.revision_id,
        parent_revision_id: gone.revision_id,
        text: 'title\nalpha\nedited\n',
    });
    const del = (path: string, revisionId: string, requestId: string) =>
        push.deleteOutcome(run, {
            base_revision_id: revisionId,
            path,
            push_id: 'run_edit_delete',
            request_id: requestId,
        });
    expect(await del('haus/edit/kept.md', kept.revision_id, 'edit-kept-delete')).toMatchObject({
        current: { revision_id: peerKept.revision_id },
        outcome: 'kept_edit',
        reason: 'edit_over_delete',
    });
    expect(await del('haus/edit/plain.md', plain.revision_id, 'edit-plain-delete')).toEqual({
        current: null,
        outcome: 'deleted',
        path: 'haus/edit/plain.md',
    });
    const [plainDeleter] = await fixture.harness.sql`
        select deleted_by from artifacts where id = ${plain.artifact_id}
    `;
    expect(plainDeleter).toEqual({ deleted_by: `agent:${fixture.orbitAgentId}` });
    expect(await del('haus/edit/never.md', plain.revision_id, 'edit-never-delete')).toEqual({
        current: null,
        outcome: 'deleted',
        path: 'haus/edit/never.md',
    });
    expect(await del('haus/edit/other.md', old.revision_id, 'edit-other-delete')).toMatchObject({
        current: { artifact_id: other.artifact_id, revision_id: other.revision_id },
        outcome: 'deleted',
    });
    const [live] = await fixture.harness.sql`
        select string_agg(path, ',' order by path) as paths from artifacts
        where server_id = ${fixture.serverId} and path like 'haus/edit/%' and deleted_at is null
    `;
    expect(live).toEqual({ paths: 'haus/edit/gone.md,haus/edit/kept.md,haus/edit/other.md' });
    expect(await push.close(run, 'run_edit_delete')).toEqual([
        {
            copyPath: null,
            currentAuthorHandle: 'orbit',
            currentRevisionId: revived.current.revision_id,
            outcome: 'kept_edit',
            path: 'haus/edit/gone.md',
            reason: 'edit_over_delete',
        },
        {
            copyPath: null,
            currentAuthorHandle: 'peer',
            currentRevisionId: peerKept.revision_id,
            outcome: 'kept_edit',
            path: 'haus/edit/kept.md',
            reason: 'edit_over_delete',
        },
    ]);
});

test("another Agent's area and invalid paths are refused, with whatever is live there", async () => {
    const peer = await peerWriter();
    const peers = await push.publish(
        peer,
        { path: 'agents/peer/notes.md', request_id: 'refuse-peer-notes' },
        'mine\n'
    );
    const run = await push.dispatch('run_refused');
    const refused = (path: string, requestId: string) =>
        push.putOutcome(run, { path, push_id: 'run_refused', request_id: requestId }, 'orbit\n');
    expect(await refused('agents/peer/notes.md', 'refuse-forbidden')).toMatchObject({
        code: 'FORBIDDEN',
        current: { author: { agent_id: fixture.peerAgentId }, revision_id: peers.revision_id },
        outcome: 'refused',
        path: 'agents/peer/notes.md',
    });
    expect(await refused('../escape.md', 'refuse-escape')).toMatchObject({
        code: 'INVALID_PATH',
        current: null,
        outcome: 'refused',
        path: '../escape.md',
    });
    expect(await refused('notes/outside.md', 'refuse-outside')).toMatchObject({
        code: 'INVALID_PATH',
        current: null,
        outcome: 'refused',
    });
    expect(
        await push.deleteOutcome(run, {
            base_revision_id: peers.revision_id,
            path: 'agents/peer/notes.md',
            push_id: 'run_refused',
            request_id: 'refuse-delete',
        })
    ).toMatchObject({ code: 'FORBIDDEN', outcome: 'refused' });
    expect(await push.countRows('artifacts', 'agents/peer/')).toBe(1);
    expect(await push.close(run, 'run_refused')).toEqual([
        {
            copyPath: null,
            currentAuthorHandle: 'peer',
            currentRevisionId: peers.revision_id,
            outcome: 'refused',
            path: 'agents/peer/notes.md',
            reason: 'FORBIDDEN',
        },
        {
            copyPath: null,
            currentAuthorHandle: null,
            currentRevisionId: null,
            outcome: 'refused',
            path: '../escape.md',
            reason: 'INVALID_PATH',
        },
        {
            copyPath: null,
            currentAuthorHandle: null,
            currentRevisionId: null,
            outcome: 'refused',
            path: 'notes/outside.md',
            reason: 'INVALID_PATH',
        },
        {
            copyPath: null,
            currentAuthorHandle: 'peer',
            currentRevisionId: peers.revision_id,
            outcome: 'refused',
            path: 'agents/peer/notes.md',
            reason: 'FORBIDDEN',
        },
    ]);
});
