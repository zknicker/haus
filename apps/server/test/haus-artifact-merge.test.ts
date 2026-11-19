import { expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { artifactPublishInputSchema } from '@haus/api';
import { publishArtifact } from '../src/artifacts/publish.ts';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

const { publish, state, storage } = artifactDriveFixture('artifact-merge');

const base = 'one\ntwo\nthree\nfour\nfive\n';

test('a stale base merges onto the head as a new revision whose base differs from its parent', async () => {
    const first = await publish({ body: base, path: 'haus/merge/clean.md' });
    const head = await publish({
        base: first.artifact.revision_id,
        body: 'ONE\ntwo\nthree\nfour\nfive\n',
        path: 'haus/merge/clean.md',
    });
    const sent = 'one\ntwo\nthree\nfour\nFIVE\n';
    const merged = await publish({
        base: first.artifact.revision_id,
        body: sent,
        path: 'haus/merge/clean.md',
        requestId: 'merge-clean-stale',
    });
    expect(merged.artifact.revision_number).toBe(3);
    expect(await revisionRow(merged.artifact.revision_id)).toEqual({
        base_revision_id: first.artifact.revision_id,
        byte_size: 24,
        parent_revision_id: head.artifact.revision_id,
        request_sha256: sha256(sent),
        sha256: sha256('ONE\ntwo\nthree\nfour\nFIVE\n'),
        text: 'ONE\ntwo\nthree\nfour\nFIVE\n',
    });
    expect(merged.artifact.sha256).toBe(sha256('ONE\ntwo\nthree\nfour\nFIVE\n'));

    const retried = await publish({
        base: first.artifact.revision_id,
        body: sent,
        path: 'haus/merge/clean.md',
        requestId: 'merge-clean-stale',
    });
    expect(retried.artifact.revision_id).toBe(merged.artifact.revision_id);
    await expect(
        publish({
            base: first.artifact.revision_id,
            body: 'something else\n',
            path: 'haus/merge/clean.md',
            requestId: 'merge-clean-stale',
        })
    ).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED' });
});

test('overlapping lines or binary bytes fail with 409 and the current head', async () => {
    const first = await publish({ body: base, path: 'haus/merge/conflict.md' });
    const head = await publish({
        base: first.artifact.revision_id,
        body: 'one\nTWO\nthree\nfour\nfive\n',
        path: 'haus/merge/conflict.md',
    });
    for (const body of ['one\ntwo!\nthree\nfour\nfive\n', 'one\ntwo\nthree\nfour\nfive\n\0']) {
        await expect(
            publish({ base: first.artifact.revision_id, body, path: 'haus/merge/conflict.md' })
        ).rejects.toMatchObject({
            code: 'REVISION_CONFLICT',
            current: { revision_id: head.artifact.revision_id, revision_number: 2 },
            status: 409,
        });
    }
    const [failed] = await state.harness.sql`
        select count(*)::int as count from artifact_revisions
        where artifact_id = ${first.artifact.artifact_id} and state = 'ready'
    `;
    expect(failed).toEqual({ count: 2 });
});

test('a head that moves while the upload is in flight merges at landing', async () => {
    const first = await publish({ body: base, path: 'haus/merge/race.md' });
    const started = Promise.withResolvers<void>();
    const gate = Promise.withResolvers<void>();
    async function* held() {
        started.resolve();
        await gate.promise;
        yield new TextEncoder().encode('one\ntwo\nthree\nfour\nFIVE\n');
    }
    const slow = publishArtifact({
        actor: state.actor,
        db: state.connection.db,
        input: artifactPublishInputSchema.parse({
            base_revision_id: first.artifact.revision_id,
            content_type: 'text/plain',
            path: 'haus/merge/race.md',
            request_id: 'merge-race-slow',
        }),
        origin: state.harness.appOrigin,
        storage,
        stream: held(),
    });
    await started.promise;
    const fast = await publish({
        base: first.artifact.revision_id,
        body: 'ONE\ntwo\nthree\nfour\nfive\n',
        path: 'haus/merge/race.md',
    });
    gate.resolve();
    const landed = (await slow).artifact;
    expect(fast.artifact.revision_number).toBe(3);
    expect(landed.revision_number).toBe(4);
    expect(await revisionRow(landed.revision_id)).toMatchObject({
        base_revision_id: first.artifact.revision_id,
        parent_revision_id: fast.artifact.revision_id,
        text: 'ONE\ntwo\nthree\nfour\nFIVE\n',
    });
});

async function revisionRow(revisionId: string) {
    const [row] = await state.harness.sql`
        select base_revision_id, byte_size::int, object_key, parent_revision_id, request_sha256,
               sha256
        from artifact_revisions where id = ${revisionId}
    `;
    const { object_key: objectKey, ...rest } = row as { object_key: string };
    return { ...rest, text: new TextDecoder().decode(storage.objects.get(objectKey)) };
}

function sha256(text: string) {
    return createHash('sha256').update(text).digest('hex');
}
