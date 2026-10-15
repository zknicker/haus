import { expect, test } from 'bun:test';
import { ARTIFACT_REVISION_RETENTION_DAYS, type ArtifactUpdatedEvent } from '@haus/api';
import { moveArtifacts } from '../src/artifacts/move.ts';
import { deleteExpiredArtifactRevisions } from '../src/artifacts/retention.ts';
import { artifactUpdatedTopic } from '../src/realtime/topics.ts';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

/**
 * Revision retention counts from the moment a newer revision replaced a revision, never from
 * the revision's own age, and never touches a file's current revision.
 */
const { publish, state, storage } = artifactDriveFixture('artifact-retention');
const day = 24 * 60 * 60 * 1000;
const now = new Date('2026-10-15T12:00:00.000Z');
const daysAgo = (days: number) => new Date(now.getTime() - days * day);

test('prunes revisions replaced before the window and keeps the current revision', async () => {
    const first = await publish({ body: 'one', path: 'prune/report.txt' });
    const second = await publish({
        base: first.artifact.revision_id,
        body: 'two',
        path: 'prune/report.txt',
    });
    const third = await publish({
        base: second.artifact.revision_id,
        body: 'three',
        path: 'prune/report.txt',
    });
    await age(first.artifact.revision_id, daysAgo(40));
    await age(second.artifact.revision_id, daysAgo(ARTIFACT_REVISION_RETENTION_DAYS + 1));
    await age(third.artifact.revision_id, daysAgo(ARTIFACT_REVISION_RETENTION_DAYS - 1));

    const deleted = await deleteExpiredArtifactRevisions(state.connection.db, storage, now);

    // `first` was replaced by `second` eight days ago; `second` only by `third` six days ago.
    expect(deleted.map((row) => row.id)).toEqual([first.artifact.revision_id]);
    expect(await revisionIds(first.artifact.artifact_id)).toEqual([
        second.artifact.revision_id,
        third.artifact.revision_id,
    ]);
    expect(storage.objects.has(objectKey(first.artifact))).toBe(false);
    expect(storage.objects.has(objectKey(second.artifact))).toBe(true);
});

test('an old current revision with no successor is always kept', async () => {
    const only = await publish({ body: 'alone', path: 'prune/alone.txt' });
    await age(only.artifact.revision_id, daysAgo(400));
    await deleteExpiredArtifactRevisions(state.connection.db, storage, now);
    expect(await revisionIds(only.artifact.artifact_id)).toEqual([only.artifact.revision_id]);
});

test('a storage failure leaves the revision claimed for startup cleanup', async () => {
    const first = await publish({ body: 'one', path: 'prune/stuck.txt' });
    const second = await publish({
        base: first.artifact.revision_id,
        body: 'two',
        path: 'prune/stuck.txt',
    });
    await age(second.artifact.revision_id, daysAgo(30));
    const failing = Object.assign(Object.create(storage) as typeof storage, {
        delete: () => Promise.reject(new Error('R2 unavailable')),
    });
    await expect(deleteExpiredArtifactRevisions(state.connection.db, failing, now)).rejects.toThrow(
        'pending cleanup'
    );
    expect(await revisionState(first.artifact.revision_id)).toBe('deleting');
});

test('a push based on a pruned revision of a moved file names the new path', async () => {
    const first = await publish({ body: 'one', path: 'prune/before.txt' });
    const second = await publish({
        base: first.artifact.revision_id,
        body: 'two',
        path: 'prune/before.txt',
    });
    await moveArtifacts(state.connection.db, state.actor, state.harness.appOrigin, {
        from: 'prune/before.txt',
        to: 'prune/after.txt',
    });
    await age(second.artifact.revision_id, daysAgo(30));
    await deleteExpiredArtifactRevisions(state.connection.db, storage, now);
    expect(await revisionState(first.artifact.revision_id)).toBe('deleted');

    await expect(
        publish({ base: first.artifact.revision_id, body: 'stale', path: 'prune/before.txt' })
    ).rejects.toMatchObject({
        code: 'REVISION_CONFLICT',
        message: expect.stringContaining('`prune/after.txt`'),
    });
});

test('a request_id retry after its revision was pruned is recognized, not republished', async () => {
    const first = await publish({ body: 'one', path: 'prune/retry.txt', requestId: 'prune-retry' });
    await publish({ base: first.artifact.revision_id, body: 'two', path: 'prune/retry.txt' });
    await ageFile(first.artifact.artifact_id, daysAgo(30));
    await deleteExpiredArtifactRevisions(state.connection.db, storage, now);

    await expect(
        publish({ body: 'one', path: 'prune/retry.txt', requestId: 'prune-retry' })
    ).rejects.toMatchObject({ code: 'DELETED' });
    expect(await revisionIds(first.artifact.artifact_id)).toHaveLength(1);
});

test('a backlog drains in bounded batches with one event per Server', async () => {
    const files = ['a', 'b', 'c', 'd', 'e'].map((name) => `prune/batch/${name}.txt`);
    for (const path of files) {
        const first = await publish({ body: 'one', path });
        await publish({ base: first.artifact.revision_id, body: 'two', path });
        await ageFile(first.artifact.artifact_id, daysAgo(30));
    }
    const events = await collectEvents(async () => {
        const deleted = await deleteExpiredArtifactRevisions(state.connection.db, storage, now, {
            batchSize: 2,
        });
        expect(deleted).toHaveLength(files.length);
    });
    expect(events).toEqual([{ artifactId: null, serverId: state.serverId }]);
});

test('closing stops between revisions and hands unprocessed claims back', async () => {
    const paths = ['x', 'y', 'z'].map((name) => `prune/close/${name}.txt`);
    const firsts: string[] = [];
    for (const path of paths) {
        const first = await publish({ body: 'one', path });
        firsts.push(first.artifact.revision_id);
        await publish({ base: first.artifact.revision_id, body: 'two', path });
        await ageFile(first.artifact.artifact_id, daysAgo(30));
    }
    const closing = new AbortController();
    const closeAfterOne = Object.assign(Object.create(storage) as typeof storage, {
        delete: async (key: string) => {
            await storage.delete(key);
            closing.abort();
        },
    });
    const deleted = await deleteExpiredArtifactRevisions(state.connection.db, closeAfterOne, now, {
        closing: closing.signal,
    });
    // One revision's object is two keys (bytes, thumbnail); the abort lands after the first.
    expect(deleted).toHaveLength(1);
    const states = await Promise.all(firsts.map(revisionState));
    expect(states.filter((value) => value === 'deleted')).toHaveLength(1);
    expect(states.filter((value) => value === 'ready')).toHaveLength(2);
});

async function age(revisionId: string, createdAt: Date) {
    await state.harness.sql`
        update artifact_revisions set created_at = ${createdAt} where id = ${revisionId}
    `;
}

async function ageFile(artifactId: string, createdAt: Date) {
    await state.harness.sql`
        update artifact_revisions set created_at = ${createdAt} where artifact_id = ${artifactId}
    `;
}

/** Revisions still listed: a pruned row stays, soft-deleted, for retries and conflict lookups. */
async function revisionIds(artifactId: string) {
    const rows = (await state.harness.sql`
        select id from artifact_revisions
        where artifact_id = ${artifactId} and state <> 'deleted'
        order by revision_number
    `) as { id: string }[];
    return rows.map((row) => row.id);
}

async function revisionState(revisionId: string) {
    const [row] = (await state.harness.sql`
        select state from artifact_revisions where id = ${revisionId}
    `) as { state: string }[];
    return row?.state;
}

async function collectEvents(run: () => Promise<void>) {
    const events: ArtifactUpdatedEvent[] = [];
    const controller = new AbortController();
    void (async () => {
        for await (const delivery of artifactUpdatedTopic.subscribe(controller.signal)) {
            events.push(delivery.event);
        }
    })().catch(() => undefined);
    await Bun.sleep(10);
    await run();
    await Bun.sleep(10);
    controller.abort();
    return events;
}

function objectKey(artifact: { artifact_id: string; revision_id: string }) {
    return `servers/${state.serverId}/artifacts/${artifact.artifact_id}/${artifact.revision_id}`;
}
