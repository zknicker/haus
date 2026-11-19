import { expect, test } from 'bun:test';
import { artifactMaxBytes } from '../src/artifacts/storage.ts';
import { drivePushFixture } from './drive-push.fixture.ts';

const push = drivePushFixture({ artifactStorageBytes: artifactMaxBytes + 150 });
const { fixture } = push;

test('a kept-both copy whose name breaks the path rules is refused as INVALID_PATH', async () => {
    const peer = await push.peerWriter();
    const path = `haus/long/${'n'.repeat(250)}.md`;
    const taken = await push.publish(peer, { path, request_id: 'long-peer' }, 'peer\n');
    const run = await push.dispatch('run_long');

    expect(
        await push.put(run, { path, push_id: 'run_long', request_id: 'long-orbit' }, 'orbit\n')
    ).toEqual({
        body: {
            code: 'INVALID_PATH',
            current: expect.objectContaining({ path, revision_id: taken.revision_id }),
            message: `\`${path}\` has no room for a conflict copy beside it: Each path segment is at most 255 characters.`,
            outcome: 'refused',
            path,
        },
        status: 200,
    });
    expect(await push.close(run, 'run_long')).toHaveLength(1);
    expect((await push.conflictItems(fixture.orbitAgentId)).map((item) => item.dedupe_key)).toEqual(
        ['drive-conflict:run_long']
    );
    expect(await push.countRows('artifacts', 'haus/long/')).toBe(1);
    expect(await push.countRows('artifact_revisions', 'haus/long/')).toBe(1);
});

test('a push over the storage budget stores nothing and lands once space frees', async () => {
    const peer = await push.peerWriter();
    const first = await push.publish(
        peer,
        { path: 'haus/full/a.md', request_id: 'full-first' },
        'x'.repeat(100)
    );
    await push.publish(
        peer,
        { base_revision_id: first.revision_id, path: 'haus/full/a.md', request_id: 'full-second' },
        'y'.repeat(100)
    );
    const run = await push.dispatch('run_full');
    const query = { path: 'haus/full/b.md', push_id: 'run_full', request_id: 'full-pushed' };

    expect(await push.put(run, query, 'b\n')).toEqual({
        body: { code: 'STORAGE_LIMIT', message: 'Server shared-file storage budget is exhausted.' },
        status: 507,
    });
    await fixture.owner.trpc.artifact.deleteVersion.mutate({
        artifact_id: first.artifact_id,
        revision_id: first.revision_id,
        serverId: fixture.serverId,
    });
    expect(await push.putOutcome(run, query, 'b\n')).toMatchObject({
        outcome: 'committed',
        path: 'haus/full/b.md',
    });
    expect(await push.close(run, 'run_full')).toEqual([]);
});
