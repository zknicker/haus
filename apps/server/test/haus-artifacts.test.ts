import { afterAll, beforeAll, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { artifactPublishInputSchema } from '@haus/api';
import {
    deleteArtifact,
    purgeServerArtifacts,
    reconcileArtifacts,
} from '../src/artifacts/delete.ts';
import { publishArtifact } from '../src/artifacts/publish.ts';
import { type ArtifactStorage, artifactMaxBytes } from '../src/artifacts/storage.ts';
import { connectHausDatabase } from '../src/postgres/connection.ts';
import { findUserById } from '../src/users/haus-user.ts';
import { createHausClient, type HausClient } from './haus-client.ts';
import { type HausServerHarness, startHausServerHarness } from './haus-server-harness.ts';

let harness: HausServerHarness;
let owner: HausClient;
let outsider: HausClient;
let connection: Awaited<ReturnType<typeof connectHausDatabase>>;
let serverId: string;
let actor: {
    kind: 'human';
    member: Awaited<ReturnType<typeof findUserById>>;
    serverId: string;
};
const objects = new Map<string, Uint8Array>();
let failUpload = false;
let failDelete = false;
const storage: ArtifactStorage = {
    delete: (key) => {
        if (failDelete) {
            return Promise.reject(new Error('R2 delete unavailable'));
        }
        objects.delete(key);
        return Promise.resolve();
    },
    downloadUrl: (key, saveAs) =>
        `https://private-r2.test/${key}?signature=temporary${saveAs ? `&save-as=${saveAs}` : ''}`,
    read: (key, maxBytes) =>
        Promise.resolve((objects.get(key) ?? new Uint8Array()).slice(0, maxBytes)),
    stream: () => new ReadableStream(),
    upload: async (key, stream) => {
        if (failUpload) {
            throw new Error('R2 upload unavailable');
        }
        const chunks: Uint8Array[] = [];
        const hash = createHash('sha256');
        for await (const chunk of stream) {
            chunks.push(chunk);
            hash.update(chunk);
        }
        const bytes = Buffer.concat(chunks);
        objects.set(key, bytes);
        return { sha256: hash.digest('hex'), size: bytes.byteLength };
    },
};

beforeAll(async () => {
    harness = await startHausServerHarness({ artifactStorage: storage });
    owner = createHausClient(harness, await harness.humans.mintSessionToken('artifact_owner'));
    outsider = createHausClient(
        harness,
        await harness.humans.mintSessionToken('artifact_outsider')
    );
    serverId = (
        await owner.trpc.server.create.mutate({ displayName: 'Artifact HQ', slug: 'artifact-hq' })
    ).id;
    connection = await connectHausDatabase(harness.databaseUrl);
    actor = {
        kind: 'human',
        member: await findUserById(
            connection.db,
            harness.humans.userIdForSubject('artifact_owner')
        ),
        serverId,
    };
});
afterAll(async () => {
    owner.close();
    outsider.close();
    await connection.close();
    await harness.close();
});

test('Server artifacts keep a stable identity and immutable versions, with retry idempotency', async () => {
    const first = await publish('version-one', 'report.txt', 'one');
    const second = await publish('version-two', 'report.txt', 'two', revise(first));
    expect(first.artifact.artifact_id).toBe(second.artifact.artifact_id);
    expect(first.artifact.revision_id).not.toBe(second.artifact.revision_id);
    expect(first.artifact.stable_url).toBe(second.artifact.stable_url);
    expect(first.artifact.version_url).not.toBe(second.artifact.version_url);
    const current = await owner.trpc.artifact.get.query({
        artifact_id: first.artifact.artifact_id,
        serverId,
    });
    expect(current.artifact.revision_id).toBe(second.artifact.revision_id);
    const historical = await owner.trpc.artifact.get.query({
        artifact_id: first.artifact.artifact_id,
        revision_id: first.artifact.revision_id,
        serverId,
    });
    expect(historical.artifact.sha256).toBe(first.artifact.sha256);
    expect((await publish('version-one', 'report.txt', 'one')).artifact.revision_id).toBe(
        first.artifact.revision_id
    );
    await expect(publish('version-one', 'report.txt', 'different')).rejects.toMatchObject({
        code: 'IDEMPOTENCY_KEY_REUSED',
    });
    const versions = await owner.trpc.artifact.versions.query({
        artifact_id: first.artifact.artifact_id,
        serverId,
    });
    expect(versions.versions.map((version) => version.revision_number)).toEqual([2, 1]);
});

test('members read the library, outsiders fail, and current revisions cannot be deleted', async () => {
    const result = await publish('access-check', 'private.txt', 'private');
    const input = { artifact_id: result.artifact.artifact_id, serverId };
    await expect(outsider.trpc.artifact.get.query(input)).rejects.toMatchObject({
        data: { code: 'FORBIDDEN' },
    });
    const download = await owner.trpc.artifact.download.query(input);
    expect(download.download_url).toContain('private-r2.test');
    expect(download.download_url).not.toContain('save-as');
    const saved = await owner.trpc.artifact.download.query({ ...input, save: true });
    expect(saved.download_url).toContain('save-as=private.txt');
    await expect(
        owner.trpc.artifact.deleteVersion.mutate({
            ...input,
            revision_id: result.artifact.revision_id,
        })
    ).rejects.toMatchObject({ data: { code: 'CONFLICT' } });
    await owner.trpc.artifact.delete.mutate(input);
    await expect(owner.trpc.artifact.get.query(input)).rejects.toMatchObject({
        data: { code: 'NOT_FOUND' },
    });
});

test('failed uploads preserve the current revision and recover reserved capacity', async () => {
    const first = await publish('failure-base', 'failure.txt', 'base');
    failUpload = true;
    await expect(publish('failure-upload', 'failure.txt', 'bad', revise(first))).rejects.toThrow(
        'R2 upload unavailable'
    );
    failUpload = false;
    const current = await owner.trpc.artifact.get.query({
        artifact_id: first.artifact.artifact_id,
        serverId,
    });
    expect(current.artifact.revision_id).toBe(first.artifact.revision_id);
    const [failed] =
        await harness.sql`select state, reserved_bytes::int from artifact_revisions where request_id = 'failure-upload'`;
    expect(failed).toMatchObject({ reserved_bytes: 0, state: 'failed' });
    await expect(publishWithBudget('storage-budget', artifactMaxBytes - 1)).rejects.toMatchObject({
        code: 'STORAGE_LIMIT',
    });
});

test('interrupted uploads and failed deletion recover on restart without exposing bytes', async () => {
    const result = await publish('delete-recovery', 'recover.txt', 'recover');
    failDelete = true;
    await expect(
        deleteArtifact(connection.db, actor, storage, result.artifact.artifact_id)
    ).rejects.toThrow('R2 delete unavailable');
    failDelete = false;
    await reconcileArtifacts(connection.db, storage);
    const [deleted] =
        await harness.sql`select state, reserved_bytes::int from artifact_revisions where id = ${result.artifact.revision_id}`;
    expect(deleted).toMatchObject({ reserved_bytes: 0, state: 'deleted' });
    await harness.restart();
    owner.close();
    owner = createHausClient(harness, await harness.humans.mintSessionToken('artifact_owner'));
    const listed = await owner.trpc.artifact.list.query({ serverId });
    expect(listed.artifacts.some((item) => item.artifact_id === result.artifact.artifact_id)).toBe(
        false
    );
});

test('cleanup never purges a live Server and reports pending cloud cleanup without breaking startup', async () => {
    const result = await publish('cleanup-live', 'cleanup-live.txt', 'keep');
    const count = objects.size;
    await purgeServerArtifacts(connection.db, storage, serverId);
    expect(objects.size).toBe(count);
    failDelete = true;
    await expect(
        deleteArtifact(connection.db, actor, storage, result.artifact.artifact_id)
    ).rejects.toThrow();
    const recovery = await reconcileArtifacts(connection.db, storage);
    expect(recovery.failedRevisionIds).toContain(result.artifact.revision_id);
    failDelete = false;
    await reconcileArtifacts(connection.db, storage);
});

test('unconfigured cloud storage refuses publication without local storage fallback', async () => {
    await expect(
        publishArtifact({
            actor,
            db: connection.db,
            input: artifactPublishInputSchema.parse({
                path: 'disabled.txt',
                request_id: 'storage-disabled',
                title: 'Disabled',
            }),
            origin: harness.appOrigin,
            storage: null,
            stream: chunks('bytes'),
        })
    ).rejects.toMatchObject({ code: 'STORAGE_UNAVAILABLE', status: 503 });
    const [row] =
        await harness.sql`select count(*)::int as count from artifact_revisions where request_id = 'storage-disabled'`;
    expect(row.count).toBe(0);
});

test('library search escapes wildcards and filters file types before pagination', async () => {
    await publish('filter-image', 'filter-image.png', 'image', undefined, 'image/png');
    await publish('filter-media', 'filter-media.mp3', 'audio', undefined, 'audio/mpeg');
    await publish('filter-other', 'filter-other.zip', 'zip', undefined, 'application/zip');
    await publish('filter-literal', 'filter_100%.txt', 'text');
    await publish('filter-decoy', 'filterX1000.txt', 'decoy');
    const list = (
        query: string,
        kind: 'all' | 'images' | 'documents' | 'media' | 'other',
        offset = 0
    ) => owner.trpc.artifact.list.query({ serverId, query, kind, offset });
    expect((await list('filter_100%', 'all')).artifacts.map((item) => item.path)).toEqual([
        'filter_100%.txt',
    ]);
    for (const [kind, path] of [
        ['images', 'filter-image.png'],
        ['media', 'filter-media.mp3'],
        ['other', 'filter-other.zip'],
    ] as const) {
        expect((await list('filter', kind)).artifacts.map((item) => item.path)).toEqual([path]);
    }
    expect((await list('filter', 'documents')).artifacts).toHaveLength(2);
    expect((await list('filter', 'documents', 1)).artifacts).toHaveLength(1);
    expect((await list('filter', 'images', 1)).artifacts).toHaveLength(0);
    expect((await list('FILTER-IMAGE.png', 'images')).artifacts).toHaveLength(1);
});

function revise(result: { artifact: { revision_id: string } }) {
    return result.artifact.revision_id;
}
function publish(
    requestId: string,
    path: string,
    body: string,
    baseRevisionId?: string,
    contentType = 'text/plain'
) {
    return publishArtifact({
        actor,
        db: connection.db,
        input: artifactPublishInputSchema.parse({
            ...(baseRevisionId ? { base_revision_id: baseRevisionId } : {}),
            content_type: contentType,
            path,
            request_id: requestId,
            title: 'Report',
        }),
        origin: harness.appOrigin,
        storage,
        stream: chunks(body),
    });
}
function publishWithBudget(requestId: string, budget: number) {
    return publishArtifact({
        actor,
        budget,
        db: connection.db,
        input: artifactPublishInputSchema.parse({
            path: 'budget.txt',
            request_id: requestId,
            title: 'Budget',
        }),
        origin: harness.appOrigin,
        storage,
        stream: chunks('body'),
    });
}
async function* chunks(value: string) {
    yield new TextEncoder().encode(value);
}
