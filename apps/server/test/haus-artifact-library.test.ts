import { beforeAll, expect, test } from 'bun:test';
import { artifactListInputSchema } from '@haus/api';
import { runArtifactAction } from '../src/artifacts/action.ts';
import { pngDpi } from '../src/artifacts/image-facts.ts';
import { ArtifactThumbnails } from '../src/artifacts/thumbnails.ts';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

/**
 * The App's library reads: records carry each revision's author and image facts, files sort by
 * name (naturally), size, kind, or time, a search also finds folders, and Restore publishes an
 * old revision's bytes as a new one.
 */
const { publish, state, storage } = artifactDriveFixture('artifact-library');

beforeAll(async () => {
    for (const [path, size] of [
        ['prints/KEY-010.png', 300],
        ['prints/KEY-002.png', 100],
        ['prints/key-001.txt', 200],
        ['prints/KEY-100-cat/final.png', 50],
    ] as const) {
        await publish({
            body: 'x'.repeat(size),
            contentType: path.endsWith('.png') ? 'image/png' : 'text/plain',
            path,
        });
    }
});

test('file names sort naturally, and size and kind sort with name as the tie', async () => {
    const names = async (order: 'name' | 'size' | 'kind', direction?: 'asc' | 'desc') =>
        (await list({ direction, order, prefix: 'prints' })).artifacts.map((file) => file.filename);
    expect(await names('name')).toEqual(['key-001.txt', 'KEY-002.png', 'KEY-010.png']);
    expect(await names('name', 'desc')).toEqual(['KEY-010.png', 'KEY-002.png', 'key-001.txt']);
    expect(await names('size')).toEqual(['KEY-002.png', 'key-001.txt', 'KEY-010.png']);
    expect(await names('kind')).toEqual(['KEY-002.png', 'KEY-010.png', 'key-001.txt']);
});

test('a search lists matching folders beside matching files', async () => {
    const page = await list({ prefix: '', query: 'cat', recursive: true });
    expect(page.folders.map((folder) => [folder.path, folder.file_count])).toEqual([
        ['prints/KEY-100-cat', 1],
    ]);
    expect(page.artifacts.map((file) => file.path)).toEqual(['prints/KEY-100-cat/final.png']);
});

test('records name the revision author; Agent routes keep the strict metadata shape', async () => {
    const page = await list({ prefix: 'prints' });
    const member = state.actor.member;
    expect(page.artifacts[0]?.author).toEqual({ type: 'user', user_id: member?.id });
    const agentPage = (await runArtifactAction({
        action: 'list',
        actor: state.actor,
        db: state.connection.db,
        input: {
            artifact_id: '',
            filters: artifactListInputSchema.omit({ serverId: true }).parse({ prefix: 'prints' }),
            offset: 0,
        },
        origin: state.harness.appOrigin,
        storage,
    })) as { artifacts: Record<string, unknown>[] };
    expect(agentPage.artifacts[0]).not.toHaveProperty('author');
    expect(agentPage.artifacts[0]).not.toHaveProperty('image');
});

test('a rendered thumbnail records the image facts, and old renders measure lazily', async () => {
    const thumbnails = new ArtifactThumbnails(state.connection.db, storage, {
        logFailure: () => undefined,
        measure: () => Promise.resolve({ dpi: 300, height: 5400, width: 4500 }),
        render: () => Promise.resolve(new Uint8Array([1])),
    });
    const published = await publish({ contentType: 'image/png', path: 'facts/print.png' });
    const revision = { ...(await revisionFacts(published.artifact.revision_id)) };
    expect(await thumbnails.ensure(revision)).toBe(true);
    const read = await state.owner.trpc.artifact.get.query({
        artifact_id: published.artifact.artifact_id,
        serverId: state.serverId,
    });
    expect(read.artifact.image).toEqual({ dpi: 300, height: 5400, width: 4500 });

    await state.harness.sql`
        update artifact_revisions set image_width = null, image_height = null, image_dpi = null
        where id = ${published.artifact.revision_id}
    `;
    expect(await thumbnails.ensure(await revisionFacts(published.artifact.revision_id))).toBe(true);
    await thumbnails.close();
    expect((await revisionFacts(published.artifact.revision_id)).imageWidth).toBe(4500);
});

test('PNG density comes from pHYs in pixels per metre', () => {
    const chunk = [0, 0, 0, 9, ...'pHYs'.split('').map((c) => c.charCodeAt(0))];
    const perMetre = [0, 0, 0x2e, 0x23, 0, 0, 0x2e, 0x23, 1];
    const signature = [137, 80, 78, 71, 13, 10, 26, 10];
    const png = new Uint8Array([...signature, ...chunk, ...perMetre, 0, 0, 0, 0]);
    expect(pngDpi(png)).toBe(300);
    expect(pngDpi(new Uint8Array([1, 2, 3]))).toBeNull();
});

test('Restore publishes the old bytes as a new revision on top of the head', async () => {
    const first = await publish({ body: 'first', path: 'restore/notes.md' });
    const second = await publish({
        base: first.artifact.revision_id,
        body: 'second',
        path: 'restore/notes.md',
    });
    const restored = await state.owner.trpc.artifact.restore.mutate({
        artifact_id: first.artifact.artifact_id,
        revision_id: first.artifact.revision_id,
        serverId: state.serverId,
    });
    expect(restored.artifact.revision_number).toBe(3);
    expect(restored.artifact.sha256).toBe(first.artifact.sha256);
    const versions = await state.owner.trpc.artifact.versions.query({
        artifact_id: first.artifact.artifact_id,
        serverId: state.serverId,
    });
    expect(versions.versions.map((version) => version.revision_id)).toEqual([
        restored.artifact.revision_id,
        second.artifact.revision_id,
        first.artifact.revision_id,
    ]);
    await expect(
        state.owner.trpc.artifact.restore.mutate({
            artifact_id: first.artifact.artifact_id,
            revision_id: restored.artifact.revision_id,
            serverId: state.serverId,
        })
    ).rejects.toThrow('already the current one');
});

async function list(input: Record<string, unknown>) {
    return await state.owner.trpc.artifact.list.query({ serverId: state.serverId, ...input });
}

async function revisionFacts(revisionId: string) {
    const [row] = (await state.harness.sql`
        select id, object_key, content_type, byte_size, thumbnail_state, image_width
        from artifact_revisions where id = ${revisionId}
    `) as {
        byte_size: number | string;
        content_type: string;
        id: string;
        image_width: number | null;
        object_key: string;
        thumbnail_state: 'failed' | 'ready' | null;
    }[];
    if (!row) {
        throw new Error(`Revision ${revisionId} is missing.`);
    }
    return {
        byteSize: Number(row.byte_size),
        contentType: row.content_type,
        id: row.id,
        imageWidth: row.image_width,
        objectKey: row.object_key,
        thumbnailState: row.thumbnail_state,
    };
}
