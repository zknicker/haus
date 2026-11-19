import { expect, test } from 'bun:test';
import { artifactPublishResultSchema } from '@haus/api';
import { drivePushFixture } from './drive-push.fixture.ts';

const push = drivePushFixture();
const base = 'title\nalpha\nbeta\ngamma\ndelta\n';

test('two writers from one base edit different lines and both edits land in one merged revision', async () => {
    const { fixture } = push;
    const seed = await push.publish(
        await fixture.mintRunner('run_merge_seed', fixture.orbitAgentId, fixture.channelId, false),
        { path: 'haus/merge/plan.md', request_id: 'merge-seed-plan' },
        base
    );
    const orbit = await push.dispatch('run_merge_orbit', { taskId: 'task_merge_orbit' });
    const peer = await push.dispatch('run_merge_peer', {
        agentId: fixture.peerAgentId,
        taskId: 'task_merge_peer',
    });

    const first = await push.putOutcome(
        orbit,
        {
            base_revision_id: seed.revision_id,
            path: 'haus/merge/plan.md',
            push_id: 'run_merge_orbit',
            request_id: 'merge-orbit-plan',
        },
        'TITLE\nalpha\nbeta\ngamma\ndelta\n'
    );
    expect(first).toMatchObject({
        current: {
            author: { agent_id: fixture.orbitAgentId, type: 'agent' },
            path: 'haus/merge/plan.md',
        },
        outcome: 'committed',
        path: 'haus/merge/plan.md',
    });
    const second = await push.putOutcome(
        peer,
        {
            base_revision_id: seed.revision_id,
            path: 'haus/merge/plan.md',
            push_id: 'run_merge_peer',
            request_id: 'merge-peer-plan',
        },
        'title\nalpha\nbeta\ngamma\nDELTA\n'
    );
    expect(second).toMatchObject({
        current: { author: { agent_id: fixture.peerAgentId, type: 'agent' } },
        outcome: 'merged',
    });
    if (first.outcome !== 'committed' || second.outcome !== 'merged') {
        throw new Error('Expected a commit, then a merge.');
    }
    expect(await push.revision(second.current.revision_id)).toEqual({
        artifact_id: seed.artifact_id,
        author_agent_id: fixture.peerAgentId,
        base_revision_id: seed.revision_id,
        parent_revision_id: first.current.revision_id,
        path: 'haus/merge/plan.md',
        revision_number: 3,
        state: 'ready',
        task_id: 'task_merge_peer',
        text: 'TITLE\nalpha\nbeta\ngamma\nDELTA\n',
    });
    expect(await push.revision(first.current.revision_id)).toMatchObject({
        base_revision_id: seed.revision_id,
        parent_revision_id: seed.revision_id,
        task_id: 'task_merge_orbit',
    });
    expect(await push.close(peer, 'run_merge_peer')).toEqual([]);
    expect(await push.conflictItems(fixture.peerAgentId)).toEqual([]);
});

test('a Channel run pushes with no Task, and a member PUT with a stale base merges', async () => {
    const channel = await push.dispatch('run_merge_channel');
    const created = await push.putOutcome(
        channel,
        {
            path: 'haus/merge/member.md',
            push_id: 'run_merge_channel',
            request_id: 'merge-channel-1',
        },
        base
    );
    if (created.outcome !== 'committed') {
        throw new Error('Expected a commit.');
    }
    expect(await push.revision(created.current.revision_id)).toMatchObject({
        base_revision_id: null,
        parent_revision_id: null,
        task_id: null,
    });
    const head = await push.memberPut(
        {
            base_revision_id: created.current.revision_id,
            path: 'haus/merge/member.md',
            request_id: 'merge-member-head',
        },
        'title\nALPHA\nbeta\ngamma\ndelta\n'
    );
    expect(head.status).toBe(200);
    const stale = await push.memberPut(
        {
            base_revision_id: created.current.revision_id,
            path: 'haus/merge/member.md',
            request_id: 'merge-member-stale',
        },
        'title\nalpha\nbeta\ngamma\ndelta\nepsilon\n'
    );
    expect(stale.status).toBe(200);
    const merged = artifactPublishResultSchema.parse(stale.body).artifact;
    expect(await push.revision(merged.revision_id)).toMatchObject({
        author_agent_id: null,
        base_revision_id: created.current.revision_id,
        parent_revision_id: artifactPublishResultSchema.parse(head.body).artifact.revision_id,
        text: 'title\nALPHA\nbeta\ngamma\ndelta\nepsilon\n',
    });
});
