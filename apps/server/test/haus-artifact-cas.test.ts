import { expect, test } from 'bun:test';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

const { publish, state, storage } = artifactDriveFixture('artifact-cas');

test('an occupied path needs its head as base; a stale base gets 409 with the current head', async () => {
    const first = await publish({ path: 'haus/plan.md', body: 'one' });
    await expect(publish({ path: 'haus/plan.md', body: 'blind' })).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
        current: { revision_id: first.artifact.revision_id },
        status: 409,
    });
    const second = await publish({
        path: 'haus/PLAN.md',
        body: 'two',
        base: first.artifact.revision_id,
    });
    expect(second.artifact).toMatchObject({
        artifact_id: first.artifact.artifact_id,
        path: 'haus/plan.md',
        revision_number: 2,
    });
    const stale = publish({
        path: 'haus/plan.md',
        body: 'stale',
        base: first.artifact.revision_id,
    });
    await expect(stale).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
        current: { revision_id: second.artifact.revision_id, revision_number: 2 },
    });
});

test('replace deliberately overwrites whatever the head is', async () => {
    const first = await publish({ path: 'haus/replace.md', body: 'one' });
    await publish({ path: 'haus/replace.md', body: 'two', base: first.artifact.revision_id });
    const replaced = await publish({ path: 'haus/replace.md', body: 'three', replace: true });
    expect(replaced.artifact.revision_number).toBe(3);
    const current = await state.owner.trpc.artifact.get.query({
        artifact_id: first.artifact.artifact_id,
        serverId: state.serverId,
    });
    expect(current.artifact.revision_id).toBe(replaced.artifact.revision_id);
    const created = await publish({ path: 'haus/replace-new.md', replace: true });
    expect(created.artifact.revision_number).toBe(1);
});

test('two writers from the same base: exactly one wins and the loser learns the head', async () => {
    const base = await publish({ path: 'haus/race.md', body: 'base' });
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const writers = ['race-writer-a', 'race-writer-b'].map((requestId) =>
        publish({
            path: 'haus/race.md',
            body: requestId,
            base: base.artifact.revision_id,
            gate,
            requestId,
        })
    );
    await waitForUploads(['race-writer-a', 'race-writer-b']);
    release();
    const results = await Promise.allSettled(writers);
    const won = results.flatMap((result) => (result.status === 'fulfilled' ? [result.value] : []));
    const lost = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
    expect(won).toHaveLength(1);
    expect(lost).toHaveLength(1);
    expect(lost[0]).toMatchObject({
        code: 'REVISION_CONFLICT',
        current: { revision_id: won[0]?.artifact.revision_id },
    });
    const [loser] = await state.harness
        .sql`select state, reserved_bytes::int from artifact_revisions where request_id in ('race-writer-a', 'race-writer-b') and state <> 'ready'`;
    expect(loser).toEqual({ reserved_bytes: 0, state: 'failed' });
});

test('two creators at one free path: the second fails fast and the first lands', async () => {
    const { promise: gate, resolve: release } = Promise.withResolvers<void>();
    const first = publish({ path: 'haus/fresh/new.md', gate, requestId: 'create-first' });
    await waitForUploads(['create-first']);
    await expect(publish({ path: 'haus/Fresh/NEW.md' })).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
        current: null,
    });
    release();
    expect((await first).artifact.path).toBe('haus/fresh/new.md');
});

test('a failed create frees its path for the next writer', async () => {
    storage.failUploads = true;
    await expect(publish({ path: 'haus/flaky.md' })).rejects.toThrow('R2 upload unavailable');
    storage.failUploads = false;
    expect((await publish({ path: 'haus/flaky.md' })).artifact.revision_number).toBe(1);
});

test('a base at a free path conflicts, naming where its artifact lives now', async () => {
    const original = await publish({ path: 'haus/old/spot.md' });
    await state.owner.trpc.artifact.move.mutate({
        from: 'haus/old/spot.md',
        serverId: state.serverId,
        to: 'haus/new/spot.md',
    });
    await expect(
        publish({ path: 'haus/old/spot.md', base: original.artifact.revision_id })
    ).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
        current: { artifact_id: original.artifact.artifact_id, path: 'haus/new/spot.md' },
    });
    await expect(publish({ path: 'haus/nowhere.md', base: 'rev_missing' })).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
        current: null,
    });
});

test('request_id retries return the first revision even after the head moves on', async () => {
    const first = await publish({ path: 'haus/retry.md', body: 'one', requestId: 'retry-once' });
    await publish({ path: 'haus/retry.md', body: 'two', base: first.artifact.revision_id });
    const retried = await publish({ path: 'haus/retry.md', body: 'one', requestId: 'retry-once' });
    expect(retried.artifact.revision_id).toBe(first.artifact.revision_id);
    await expect(
        publish({ path: 'haus/elsewhere.md', body: 'one', requestId: 'retry-once' })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
});

test('a revision records its base, parent, Task, and the bytes the writer sent', async () => {
    const first = await publish({ path: 'haus/attributed.md', body: 'one' });
    const second = await publish({
        base: first.artifact.revision_id,
        body: 'two',
        path: 'haus/attributed.md',
        taskId: 'task_attributed',
    });
    const replaced = await publish({ path: 'haus/attributed.md', body: 'three', replace: true });
    const versions = await state.owner.trpc.artifact.versions.query({
        artifact_id: first.artifact.artifact_id,
        serverId: state.serverId,
    });
    expect(
        versions.versions.map((version) => [
            version.revision_id,
            version.base_revision_id,
            version.parent_revision_id,
            version.task_id,
        ])
    ).toEqual([
        [replaced.artifact.revision_id, null, second.artifact.revision_id, null],
        [
            second.artifact.revision_id,
            first.artifact.revision_id,
            first.artifact.revision_id,
            'task_attributed',
        ],
        [first.artifact.revision_id, null, null, null],
    ]);
    const [row] = await state.harness.sql`
        select request_sha256 from artifact_revisions where id = ${second.artifact.revision_id}
    `;
    expect(row).toEqual({ request_sha256: second.artifact.sha256 });
});

test('a retry is checked against the bytes the writer sent, not the stored head', async () => {
    const first = await publish({ path: 'haus/merged.md', body: 'sent', requestId: 'sent-bytes' });
    await state.harness.sql`
        update artifact_revisions set sha256 = ${'0'.repeat(64)}
        where id = ${first.artifact.revision_id}
    `;
    const retried = await publish({
        path: 'haus/merged.md',
        body: 'sent',
        requestId: 'sent-bytes',
    });
    expect(retried.artifact.revision_id).toBe(first.artifact.revision_id);
    await expect(
        publish({ path: 'haus/merged.md', body: 'other', requestId: 'sent-bytes' })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
});

async function waitForUploads(requestIds: string[]) {
    for (let attempt = 0; attempt < 200; attempt += 1) {
        const [row] = await state.harness
            .sql`select count(*)::int as count from artifact_revisions where request_id in ${state.harness.sql(requestIds)} and state = 'uploading'`;
        if (row.count === requestIds.length) {
            return;
        }
        await Bun.sleep(10);
    }
    throw new Error('Uploads never started.');
}
