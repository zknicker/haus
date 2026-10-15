import { expect, test } from 'bun:test';
import { deleteArtifact } from '../src/artifacts/delete.ts';
import { artifactThumbnailKey } from '../src/artifacts/storage.ts';
import {
    artifactThumbnailEdge,
    renderArtifactThumbnail,
} from '../src/artifacts/thumbnail-render.ts';
import { ArtifactThumbnails } from '../src/artifacts/thumbnails.ts';
import { artifactDriveFixture } from './artifact-drive-fixture.ts';

/**
 * Raster revisions get a WebP thumbnail beside the original: eagerly after publish, lazily on
 * the first `artifact.thumbnail` read for older revisions. A source that does not decode keeps
 * its kind icon and never fails the publish.
 */
const { publish, state, storage } = artifactDriveFixture('artifact-thumbnails');
const failures: string[] = [];
const thumbnails = () =>
    new ArtifactThumbnails(state.connection.db, storage, {
        logFailure: (revisionId, reason) => failures.push(`${revisionId}:${reason}`),
    });

test('renders a large raster to a WebP whose longest edge is the thumbnail edge', async () => {
    const thumbnail = await renderArtifactThumbnail(await poster(3000, 3600));
    const metadata = await imageMetadata(thumbnail);
    expect(metadata).toEqual({ format: 'webp', height: artifactThumbnailEdge, width: 853 });
    // Small sources are never enlarged.
    expect(await imageMetadata(await renderArtifactThumbnail(await poster(300, 200)))).toEqual({
        format: 'webp',
        height: 200,
        width: 300,
    });
    await expect(renderArtifactThumbnail(new TextEncoder().encode('not a png'))).rejects.toThrow();
});

test('a published raster gets its thumbnail and the read signs its key', async () => {
    const service = thumbnails();
    const published = await publish({
        body: await poster(2400, 1600),
        contentType: 'image/png',
        path: 'thumbs/poster.png',
        thumbnails: service,
    });
    const revision = await revisionRow(published.artifact.revision_id);
    // The publish kicked off the render; ensure joins it rather than rendering twice.
    expect(await service.ensure(revision)).toBe(true);
    const key = artifactThumbnailKey(revision.objectKey);
    expect(await imageMetadata(storage.objects.get(key) ?? new Uint8Array())).toMatchObject({
        format: 'webp',
        width: artifactThumbnailEdge,
    });
    expect((await revisionRow(revision.id)).thumbnailState).toBe('ready');

    const read = await state.owner.trpc.artifact.thumbnail.query({
        artifact_id: published.artifact.artifact_id,
        revision_id: revision.id,
        serverId: state.serverId,
    });
    expect(read).toMatchObject({ status: 'ready', thumbnail_url: `https://r2.test/${key}` });

    await deleteArtifact(state.connection.db, state.actor, storage, published.artifact.artifact_id);
    expect(storage.objects.has(key)).toBe(false);
});

test('a revision published before thumbnails renders on its first read', async () => {
    const published = await publish({
        body: await poster(1200, 1200),
        contentType: 'image/jpeg',
        path: 'thumbs/older.jpg',
    });
    expect((await revisionRow(published.artifact.revision_id)).thumbnailState).toBeNull();
    const read = await state.owner.trpc.artifact.thumbnail.query({
        artifact_id: published.artifact.artifact_id,
        revision_id: published.artifact.revision_id,
        serverId: state.serverId,
    });
    expect(read.status).toBe('ready');
    expect((await revisionRow(published.artifact.revision_id)).thumbnailState).toBe('ready');
});

test('bytes that do not decode publish fine, mark the thumbnail failed, and read as none', async () => {
    const service = thumbnails();
    const published = await publish({
        body: 'definitely not pixels',
        contentType: 'image/png',
        path: 'thumbs/corrupt.png',
        thumbnails: service,
    });
    expect(published.artifact.revision_id).toBeString();
    expect(await service.ensure(await revisionRow(published.artifact.revision_id))).toBe(false);
    expect((await revisionRow(published.artifact.revision_id)).thumbnailState).toBe('failed');
    expect(failures).toContain(`${published.artifact.revision_id}:decode`);
    const read = await state.owner.trpc.artifact.thumbnail.query({
        artifact_id: published.artifact.artifact_id,
        revision_id: published.artifact.revision_id,
        serverId: state.serverId,
    });
    expect(read).toEqual({ status: 'none' });
});

test('non-raster files never render a thumbnail', async () => {
    const published = await publish({
        body: '<svg/>',
        contentType: 'image/svg+xml',
        path: 'a.svg',
    });
    const read = await state.owner.trpc.artifact.thumbnail.query({
        artifact_id: published.artifact.artifact_id,
        revision_id: published.artifact.revision_id,
        serverId: state.serverId,
    });
    expect(read).toEqual({ status: 'none' });
    expect((await revisionRow(published.artifact.revision_id)).thumbnailState).toBeNull();
});

/** A flat test image, encoded by the same codec the Server renders with. */
async function poster(width: number, height: number) {
    const image = Bun as unknown as {
        Image: new (
            source: Uint8Array
        ) => {
            resize(w: number, h: number): { png(): { bytes(): Promise<Uint8Array> } };
        };
    };
    const seed = await Bun.file(
        new URL('../../website/public/favicon-32.png', import.meta.url)
    ).bytes();
    return await new image.Image(seed).resize(width, height).png().bytes();
}

async function imageMetadata(bytes: Uint8Array) {
    const image = Bun as unknown as {
        Image: new (
            source: Uint8Array
        ) => { metadata(): Promise<{ format: string; height: number; width: number }> };
    };
    return await new image.Image(bytes).metadata();
}

async function revisionRow(revisionId: string) {
    const [row] = (await state.harness.sql`
        select id, object_key, content_type, byte_size, thumbnail_state
        from artifact_revisions where id = ${revisionId}
    `) as {
        byte_size: number | string;
        content_type: string;
        id: string;
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
        objectKey: row.object_key,
        thumbnailState: row.thumbnail_state,
    };
}
