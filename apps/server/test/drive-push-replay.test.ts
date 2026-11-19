import { expect, test } from 'bun:test';
import { drivePushOutcomeSchema } from '@haus/api';
import { drivePushFixture } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;

test('a replayed put and delete return the stored outcome, even closed and under a later push', async () => {
    const peer = await fixture.mintRunner(
        'run_replay_peer',
        fixture.peerAgentId,
        fixture.channelId,
        false
    );
    await push.publish(
        peer,
        { path: 'haus/replay/taken.md', request_id: 'replay-peer-taken' },
        'peer\n'
    );
    const doomed = await push.publish(
        peer,
        { path: 'haus/replay/doomed.md', request_id: 'replay-peer-doomed' },
        'x\n'
    );
    const first = await push.dispatch('run_replay_first');
    const keep = {
        path: 'haus/replay/taken.md',
        push_id: 'run_replay_first',
        request_id: 'replay-keep',
    };
    const kept = await push.putOutcome(first, keep, 'orbit\n');
    expect(kept).toMatchObject({
        copy: { path: 'haus/replay/taken.conflict-orbit.md' },
        outcome: 'kept_both',
    });
    const remove = {
        base_revision_id: doomed.revision_id,
        path: 'haus/replay/doomed.md',
        push_id: 'run_replay_first',
        request_id: 'replay-delete',
    };
    const deleted = await push.deleteOutcome(first, remove);
    expect(deleted).toEqual({ current: null, outcome: 'deleted', path: 'haus/replay/doomed.md' });
    expect(await push.putOutcome(first, keep, 'orbit\n')).toEqual(kept);
    expect(await push.close(first, 'run_replay_first')).toHaveLength(1);

    const later = await push.dispatch('run_replay_later');
    expect(await push.putOutcome(later, keep, 'orbit\n')).toEqual(kept);
    expect(
        await push.putOutcome(later, { ...keep, push_id: 'run_replay_later' }, 'orbit\n')
    ).toEqual(kept);
    expect(await push.deleteOutcome(later, { ...remove, push_id: 'run_replay_later' })).toEqual(
        deleted
    );
    expect(await push.close(later, 'run_replay_later')).toEqual([]);

    expect(await push.countRows('artifacts', 'haus/replay/taken.conflict')).toBe(1);
    expect(await push.countRows('artifact_revisions', 'haus/replay/')).toBe(3);
    const items = await push.conflictItems(fixture.orbitAgentId);
    expect(items.map((item) => item.dedupe_key)).toEqual(['drive-conflict:run_replay_first']);
});

test('a new request on a closed push is 409 PUSH_CLOSED, and a push must name a run of yours', async () => {
    const run = await push.dispatch('run_replay_closed');
    expect(await push.close(run, 'run_replay_closed')).toEqual([]);
    const late = await push.put(
        run,
        { path: 'haus/replay/late.md', push_id: 'run_replay_closed', request_id: 'replay-late' },
        'late\n'
    );
    expect(late).toEqual({
        body: {
            code: 'PUSH_CLOSED',
            message: 'Push `run_replay_closed` is closed. Send this file in your next push.',
        },
        status: 409,
    });
    const lateDelete = await push.postJson(run, '/api/agent/drive/push/delete', {
        base_revision_id: 'rev_none',
        path: 'haus/replay/late.md',
        push_id: 'run_replay_closed',
        request_id: 'replay-late-delete',
    });
    expect(lateDelete).toMatchObject({ body: { code: 'PUSH_CLOSED' }, status: 409 });
    expect(await push.countRows('artifacts', 'haus/replay/late')).toBe(0);

    await push.dispatch('run_replay_peer_run', { agentId: fixture.peerAgentId });
    for (const pushId of ['run_never_dispatched', 'run_replay_peer_run']) {
        const response = await push.put(
            run,
            { path: 'haus/replay/stray.md', push_id: pushId, request_id: `replay-${pushId}` },
            'stray\n'
        );
        expect(response).toMatchObject({ body: { code: 'NOT_FOUND' }, status: 404 });
    }
});

test('concurrent duplicates converge on one stored outcome and one revision', async () => {
    const run = await push.dispatch('run_replay_race');
    const query = {
        path: 'haus/replay/race.md',
        push_id: 'run_replay_race',
        request_id: 'replay-race',
    };
    const responses = await Promise.all([1, 2, 3].map(() => push.put(run, query, 'race\n')));
    const answered = responses.filter((response) => response.status === 200);
    expect(answered.length).toBeGreaterThan(0);
    for (const response of responses.filter((candidate) => candidate.status !== 200)) {
        expect(response).toMatchObject({ body: { code: 'UPLOAD_CONFLICT' }, status: 409 });
    }
    const settled = drivePushOutcomeSchema.parse((await push.put(run, query, 'race\n')).body);
    expect(settled).toMatchObject({ outcome: 'committed', path: 'haus/replay/race.md' });
    for (const response of answered) {
        expect(response.body).toEqual(settled);
    }
    expect(await push.countRows('artifact_revisions', 'haus/replay/race.md')).toBe(1);
});
