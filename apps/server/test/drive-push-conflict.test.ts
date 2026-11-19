import { expect, test } from 'bun:test';
import { drivePushFixture, expectOutcome } from './drive-push.fixture.ts';

const push = drivePushFixture();
const { fixture } = push;
const base = 'title\nalpha\nbeta\n';
const { orbitWriter, peerWriter } = push;

test('a push keeps both versions under exact copy names and its close queues one item', async () => {
    const orbit = await orbitWriter();
    const peer = await peerWriter();
    const notes = await push.publish(
        orbit,
        { path: 'haus/keep/notes.md', request_id: 'keep-seed-notes' },
        base
    );
    const peerNotes = await push.publish(
        peer,
        {
            base_revision_id: notes.revision_id,
            path: 'haus/keep/notes.md',
            request_id: 'keep-peer-notes',
        },
        'title\nPEER\nbeta\n'
    );
    const logo = await push.publish(
        orbit,
        { path: 'haus/keep/logo.png', request_id: 'keep-seed-logo' },
        Uint8Array.of(0x89, 0x50, 0, 1)
    );
    const peerLogo = await push.publish(
        peer,
        {
            base_revision_id: logo.revision_id,
            path: 'haus/keep/logo.png',
            request_id: 'keep-peer-logo',
        },
        Uint8Array.of(0x89, 0x50, 0, 2)
    );
    const peerEnv = await push.publish(
        peer,
        { path: 'haus/keep/.env', request_id: 'keep-peer-env' },
        'A=1\n'
    );

    const run = await push.dispatch('run_conflict_keep', { taskId: 'task_conflict_keep' });
    const pushed = (query: Record<string, string>, body: string | Uint8Array) =>
        push.putOutcome(run, { push_id: 'run_conflict_keep', ...query }, body);
    const sameLines = expectOutcome(
        await pushed(
            {
                base_revision_id: notes.revision_id,
                path: 'haus/keep/notes.md',
                request_id: 'keep-notes-1',
            },
            'title\nORBIT\nbeta\n'
        ),
        'kept_both'
    );
    expect(sameLines).toMatchObject({
        copy: {
            author: { agent_id: fixture.orbitAgentId, type: 'agent' },
            path: 'haus/keep/notes.conflict-orbit.md',
        },
        current: {
            author: { agent_id: fixture.peerAgentId, type: 'agent' },
            path: 'haus/keep/notes.md',
            revision_id: peerNotes.revision_id,
        },
        path: 'haus/keep/notes.md',
        reason: 'same_lines',
    });
    const again = expectOutcome(
        await pushed(
            {
                base_revision_id: notes.revision_id,
                path: 'haus/keep/notes.md',
                request_id: 'keep-notes-2',
            },
            'title\nORBIT AGAIN\nbeta\n'
        ),
        'kept_both'
    );
    expect(again.copy.path).toBe('haus/keep/notes.conflict-orbit-2.md');
    const binary = expectOutcome(
        await pushed(
            {
                base_revision_id: logo.revision_id,
                path: 'haus/keep/logo.png',
                request_id: 'keep-logo-1',
            },
            Uint8Array.of(0x89, 0x50, 0, 3)
        ),
        'kept_both'
    );
    expect(binary).toMatchObject({
        copy: { path: 'haus/keep/logo.conflict-orbit.png' },
        current: { revision_id: peerLogo.revision_id },
        reason: 'binary',
    });
    const created = expectOutcome(
        await pushed({ path: 'haus/keep/.env', request_id: 'keep-env-1' }, 'B=2\n'),
        'kept_both'
    );
    expect(created).toMatchObject({
        copy: { path: 'haus/keep/.env.conflict-orbit' },
        current: { revision_id: peerEnv.revision_id },
        reason: 'both_created',
    });
    expect(await push.revision(sameLines.copy.revision_id)).toEqual({
        artifact_id: sameLines.copy.artifact_id,
        author_agent_id: fixture.orbitAgentId,
        base_revision_id: null,
        parent_revision_id: null,
        path: 'haus/keep/notes.conflict-orbit.md',
        revision_number: 1,
        state: 'ready',
        task_id: 'task_conflict_keep',
        text: 'title\nORBIT\nbeta\n',
    });
    expect(await push.revision(peerNotes.revision_id)).toMatchObject({
        text: 'title\nPEER\nbeta\n',
    });

    const listed = await push.close(run, 'run_conflict_keep');
    const file = (path: string, copyPath: string, revisionId: string, reason: string) => ({
        copyPath,
        currentAuthorHandle: 'peer',
        currentRevisionId: revisionId,
        outcome: 'kept_both',
        path,
        reason,
    });
    const expected = [
        file(
            'haus/keep/notes.md',
            'haus/keep/notes.conflict-orbit.md',
            peerNotes.revision_id,
            'same_lines'
        ),
        file(
            'haus/keep/notes.md',
            'haus/keep/notes.conflict-orbit-2.md',
            peerNotes.revision_id,
            'same_lines'
        ),
        file(
            'haus/keep/logo.png',
            'haus/keep/logo.conflict-orbit.png',
            peerLogo.revision_id,
            'binary'
        ),
        file(
            'haus/keep/.env',
            'haus/keep/.env.conflict-orbit',
            peerEnv.revision_id,
            'both_created'
        ),
    ];
    expect(listed).toEqual(expected);
    const items = await push.conflictItems(fixture.orbitAgentId);
    expect(items.map((item) => item.dedupe_key)).toEqual(['drive-conflict:run_conflict_keep']);
    expect(JSON.parse(items[0]?.content ?? '{}')).toEqual({
        files: expected,
        id: 'drive-conflict:run_conflict_keep',
        pushId: 'run_conflict_keep',
        writer: { agentId: fixture.orbitAgentId, type: 'agent' },
    });
    expect(await push.close(run, 'run_conflict_keep')).toEqual(expected);
    expect(await push.conflictItems(fixture.orbitAgentId)).toHaveLength(1);
});

test("a push that never closed is closed by the writer's next push and its item queues once", async () => {
    const peer = await peerWriter();
    await push.publish(
        peer,
        { path: 'haus/implicit/a.md', request_id: 'implicit-peer-a' },
        'peer\n'
    );
    const first = await push.dispatch('run_implicit_first');
    expectOutcome(
        await push.putOutcome(
            first,
            {
                path: 'haus/implicit/a.md',
                push_id: 'run_implicit_first',
                request_id: 'implicit-a-1',
            },
            'orbit\n'
        ),
        'kept_both'
    );
    const next = await push.dispatch('run_implicit_next');
    expectOutcome(
        await push.putOutcome(
            next,
            {
                path: 'haus/implicit/b.md',
                push_id: 'run_implicit_next',
                request_id: 'implicit-b-1',
            },
            'fresh\n'
        ),
        'committed'
    );
    const keys = async () =>
        (await push.conflictItems(fixture.orbitAgentId))
            .map((item) => item.dedupe_key)
            .filter((key) => key.includes('implicit'));
    expect(await keys()).toEqual(['drive-conflict:run_implicit_first']);
    expect(await push.close(first, 'run_implicit_first')).toMatchObject([
        {
            copyPath: 'haus/implicit/a.conflict-orbit.md',
            outcome: 'kept_both',
            reason: 'both_created',
        },
    ]);
    expect(await push.close(next, 'run_implicit_next')).toEqual([]);
    expect(await keys()).toEqual(['drive-conflict:run_implicit_first']);
});

test("a cited path's citation moves to the push's revision, and to the copy when it kept both", async () => {
    const orbit = await orbitWriter();
    const peer = await peerWriter();
    const plan = await push.publish(
        orbit,
        { path: 'haus/cite/plan.md', request_id: 'cite-seed-plan' },
        base
    );
    const clash = await push.publish(
        orbit,
        { path: 'haus/cite/clash.md', request_id: 'cite-seed-clash' },
        base
    );
    const run = await push.dispatch('run_cite');
    const sent = await fetch(new URL('/api/agent/messages/send', fixture.harness.url), {
        body: JSON.stringify({
            content:
                'Updated [plan](drive://haus/cite/plan.md) and [clash](drive://haus/cite/clash.md).',
            nonce: 'nonce_run_cite',
            target: '#product',
        }),
        headers: { authorization: `Bearer ${run.token}`, 'content-type': 'application/json' },
        method: 'POST',
    });
    expect(sent.status).toBe(200);
    const messageId = ((await sent.json()) as { message: { id: string } }).message.id;
    await push.publish(
        peer,
        {
            base_revision_id: clash.revision_id,
            path: 'haus/cite/clash.md',
            request_id: 'cite-peer-clash',
        },
        'title\nPEER\nbeta\n'
    );
    const pushedPlan = expectOutcome(
        await push.putOutcome(
            run,
            {
                base_revision_id: plan.revision_id,
                path: 'haus/cite/plan.md',
                push_id: 'run_cite',
                request_id: 'cite-plan-put',
            },
            'title\nalpha\nbeta\ngamma\n'
        ),
        'committed'
    );
    const pushedClash = expectOutcome(
        await push.putOutcome(
            run,
            {
                base_revision_id: clash.revision_id,
                path: 'haus/cite/clash.md',
                push_id: 'run_cite',
                request_id: 'cite-clash-put',
            },
            'title\nORBIT\nbeta\n'
        ),
        'kept_both'
    );
    await push.close(run, 'run_cite');
    const citations = await fixture.harness.sql`
        select path, artifact_id, revision_id from message_drive_citations
        where message_id = ${messageId} order by ordinal
    `;
    expect(citations).toEqual([
        {
            artifact_id: plan.artifact_id,
            path: 'haus/cite/plan.md',
            revision_id: pushedPlan.current.revision_id,
        },
        {
            artifact_id: pushedClash.copy.artifact_id,
            path: 'haus/cite/clash.md',
            revision_id: pushedClash.copy.revision_id,
        },
    ]);
});
