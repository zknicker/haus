import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import type { ArtifactStorage } from '../src/artifacts/storage.ts';
import { serveLinearAvatar, serveLinearUploadSource } from '../src/linear/signed-url-routes.ts';
import {
    checkLinearUploadRevision,
    LinearArtifactUnavailableError,
    linearUploadMeta,
    mintLinearAvatarUrl,
    signLinearUploadToken,
    verifyLinearAvatarPath,
    verifyLinearUploadToken,
} from '../src/linear/signed-urls.ts';
import { bootstrapHausDatabase } from '../src/postgres/bootstrap.ts';
import { connectHausDatabase, type HausConnection } from '../src/postgres/connection.ts';
import { createOpaqueId } from '../src/postgres/opaque-id.ts';
import {
    agentsTable,
    artifactRevisionsTable,
    artifactsTable,
    avatarsTable,
} from '../src/postgres/schema.ts';
import { type LinearWriteSeed, seedLinearWorkspace } from './linear-write-seed.ts';
import { type PostgresCluster, startPostgresCluster } from './postgres-cluster.ts';

const signingKey = 'linear-url-signing-key-for-tests-0123456789';
const origin = 'https://haus.example';
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 9, 9, 9, 9]);
const objects = new Map<string, Uint8Array>();
const storage: ArtifactStorage = {
    delete: () => Promise.resolve(),
    downloadUrl: () => 'unused',
    read: (key, maxBytes) =>
        Promise.resolve((objects.get(key) ?? new Uint8Array()).slice(0, maxBytes)),
    upload: () => Promise.reject(new Error('unused')),
};

let cluster: PostgresCluster;
let connection: HausConnection;
let seed: LinearWriteSeed;

beforeAll(async () => {
    cluster = await startPostgresCluster();
    await bootstrapHausDatabase(cluster.databaseUrl, 'haus');
    connection = await connectHausDatabase(cluster.databaseUrl);
    seed = await seedLinearWorkspace(connection.db);
});

afterAll(async () => {
    await connection?.close();
    await cluster?.stop();
});

describe('tokens', () => {
    test('an avatar path verifies until it expires and only for its Agent', () => {
        const now = Date.parse('2026-10-15T12:00:00.000Z');
        const url = new URL(mintLinearAvatarUrl({ origin, signingKey }, 'agt_A', now));
        const [, , , , agentId = '', exp = '', sig = ''] = url.pathname.split('/');
        expect(url.origin).toBe(origin);
        expect(verifyLinearAvatarPath(signingKey, { agentId, exp, sig }, now)).toBe(true);
        expect(verifyLinearAvatarPath(signingKey, { agentId: 'agt_B', exp, sig }, now)).toBe(false);
        expect(verifyLinearAvatarPath('another-key', { agentId, exp, sig }, now)).toBe(false);
        expect(verifyLinearAvatarPath(signingKey, { agentId, exp, sig }, now + 16 * 60_000)).toBe(
            false
        );
    });

    test('an upload token round-trips its claim and refuses tampering, expiry, and reuse', () => {
        const now = Date.now();
        const claim = { artifactId: 'art_1', revisionId: 'rev_1', serverId: 'srv_1' };
        const token = signLinearUploadToken(signingKey, claim, now);
        expect(verifyLinearUploadToken(signingKey, token, now)).toMatchObject(claim);
        const [body = '', sig = ''] = token.split('.');
        const forged = Buffer.from(JSON.stringify({ ...claim, artifactId: 'art_2', exp: 9e9 }));
        expect(
            verifyLinearUploadToken(signingKey, `${forged.toString('base64url')}.${sig}`, now)
        ).toBeNull();
        expect(verifyLinearUploadToken(signingKey, token, now + 3 * 60_000)).toBeNull();
        // An avatar signature over the same bytes never verifies as an upload token.
        const avatar = new URL(mintLinearAvatarUrl({ origin, signingKey }, body, now));
        expect(
            verifyLinearUploadToken(signingKey, `${body}.${avatar.pathname.split('/')[6]}`, now)
        ).toBeNull();
    });
});

describe('upload source', () => {
    test('a ready image revision on the Server becomes signed upload _meta', async () => {
        const artifact = await seedArtifact('image/png', png);
        const meta = await linearUploadMeta(
            connection.db,
            { origin, signingKey },
            {
                arguments: { artifactId: artifact.artifactId },
                serverId: seed.serverId,
                tool: 'upload_image',
            }
        );
        expect(meta?.upload).toMatchObject({
            contentType: 'image/png',
            filename: 'mockup.png',
            size: png.byteLength,
        });
        const token = decodeURIComponent(
            new URL(meta?.upload.url ?? '').pathname.split('/').at(-1) ?? ''
        );
        const served = await serveLinearUploadSource(
            { db: connection.db, signingKey, storage },
            token
        );
        expect(served).toEqual({ body: png, contentType: 'image/png', status: 200 });

        await connection.db
            .update(artifactsTable)
            .set({ deletedAt: new Date() })
            .where(eq(artifactsTable.id, artifact.artifactId));
        expect(
            await serveLinearUploadSource({ db: connection.db, signingKey, storage }, token)
        ).toEqual({
            status: 404,
        });
    });

    test('other tools add no upload _meta', async () => {
        expect(
            await linearUploadMeta(
                connection.db,
                { origin, signingKey },
                {
                    arguments: {},
                    serverId: seed.serverId,
                    tool: 'create_comment',
                }
            )
        ).toBeUndefined();
    });

    test('missing, other-Server, non-image, and oversized files are unavailable', async () => {
        const text = await seedArtifact('text/plain', new Uint8Array([1]));
        const large = await seedArtifact('image/png', png, 11 * 1024 * 1024);
        const image = await seedArtifact('image/png', png);
        const refusals = [
            { artifactId: 'art_missing', serverId: seed.serverId },
            { artifactId: image.artifactId, serverId: 'srv_other' },
            { artifactId: text.artifactId, serverId: seed.serverId },
            { artifactId: large.artifactId, serverId: seed.serverId },
            { artifactId: image.artifactId, revisionId: 'rev_missing', serverId: seed.serverId },
        ];
        for (const input of refusals) {
            await expect(checkLinearUploadRevision(connection.db, input)).rejects.toBeInstanceOf(
                LinearArtifactUnavailableError
            );
        }
    });

    test('no signing key or no storage serves nothing', async () => {
        const token = signLinearUploadToken(signingKey, {
            artifactId: 'a',
            revisionId: 'r',
            serverId: 's',
        });
        expect(
            await serveLinearUploadSource({ db: connection.db, signingKey: null, storage }, token)
        ).toEqual({ status: 404 });
        expect(
            await serveLinearUploadSource({ db: connection.db, signingKey, storage: null }, token)
        ).toEqual({ status: 404 });
    });
});

describe('avatar', () => {
    test("serves the Agent's current avatar, and nothing once it retires", async () => {
        const avatarId = `avt_${'a'.repeat(16)}`;
        await connection.db.insert(avatarsTable).values({
            byteSize: png.byteLength,
            bytes: png,
            id: avatarId,
            mediaType: 'image/png',
            sha256: createHash('sha256').update(png).digest('hex'),
        });
        await connection.db
            .update(agentsTable)
            .set({ avatarId })
            .where(eq(agentsTable.id, seed.agentId));
        const url = new URL(mintLinearAvatarUrl({ origin, signingKey }, seed.agentId));
        const [, , , , agentId = '', exp = '', sig = ''] = url.pathname.split('/');
        const dependencies = { db: connection.db, signingKey, storage: null };
        expect(await serveLinearAvatar(dependencies, { agentId, exp, sig })).toEqual({
            body: png,
            contentType: 'image/png',
            status: 200,
        });
        expect(await serveLinearAvatar(dependencies, { agentId, exp, sig: `${sig}x` })).toEqual({
            status: 404,
        });
        await connection.db
            .update(agentsTable)
            .set({ retiredAt: new Date() })
            .where(eq(agentsTable.id, seed.agentId));
        expect(await serveLinearAvatar(dependencies, { agentId, exp, sig })).toEqual({
            status: 404,
        });
    });
});

async function seedArtifact(contentType: string, bytes: Uint8Array, byteSize = bytes.byteLength) {
    const artifactId = createOpaqueId('art');
    const revisionId = createOpaqueId('rev');
    const objectKey = `objects/${revisionId}`;
    objects.set(objectKey, bytes);
    await connection.db.insert(artifactsTable).values({
        creatorAgentId: seed.agentId,
        id: artifactId,
        path: `/designs/${artifactId}.png`,
        pathKey: `/designs/${artifactId}.png`,
        serverId: seed.serverId,
    });
    await connection.db.insert(artifactRevisionsTable).values({
        artifactId,
        authorAgentId: seed.agentId,
        authorKey: seed.agentId,
        byteSize,
        contentType,
        filename: 'mockup.png',
        id: revisionId,
        objectKey,
        requestId: createOpaqueId('req'),
        reservedBytes: byteSize,
        revisionNumber: 1,
        serverId: seed.serverId,
        sha256: createHash('sha256').update(bytes).digest('hex'),
        state: 'ready',
        title: 'Mockup',
    });
    await connection.db
        .update(artifactsTable)
        .set({ currentRevisionId: revisionId })
        .where(eq(artifactsTable.id, artifactId));
    return { artifactId, revisionId };
}
