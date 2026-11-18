import { artifactPathBasename, artifactPublicTokenPattern } from '@haus/api';
import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    artifactsTable as artifacts,
    artifactRevisionsTable as revisions,
    serversTable,
} from '../postgres/schema.ts';
import { contentDisposition } from '../utils/content-disposition.ts';
import { publicContent, publicResponseHeaders } from './public-content.ts';
import { type ArtifactStorage, artifactThumbnailKey } from './storage.ts';
import type { ArtifactThumbnails } from './thumbnails.ts';

type TokenRequest = FastifyRequest<{ Params: { token: string } }>;

/**
 * Public links (specs/artifact-public-links.md): `GET /f/<token>` streams a shared file's current
 * revision and `GET /f/<token>/thumbnail` its WebP thumbnail, to anyone. Every miss is the same
 * bare 404, so a response never reveals whether some other file exists.
 */
export function registerArtifactPublicRoutes(
    app: FastifyInstance,
    options: {
        db: HausDatabase;
        storage: ArtifactStorage | null;
        thumbnails: ArtifactThumbnails | null;
    }
) {
    const { db, storage, thumbnails } = options;
    app.get('/f/:token', async (request: TokenRequest, reply) => {
        const revision = storage ? await publicRevision(db, request.params.token) : null;
        if (!(revision && storage)) {
            return await notFound(reply);
        }
        const content = publicContent(revision.contentType);
        const filename = artifactPathBasename(revision.path);
        return await sendObject(request, reply, {
            body: () => storage.stream(revision.objectKey),
            contentType: content.contentType,
            disposition: contentDisposition(content.disposition, filename),
            etag: `"${revision.sha256}"`,
            size: revision.byteSize,
        });
    });
    app.get('/f/:token/thumbnail', async (request: TokenRequest, reply) => {
        const revision = storage ? await publicRevision(db, request.params.token) : null;
        if (!(revision && storage && (await thumbnails?.ensure(revision)))) {
            return await notFound(reply);
        }
        const filename = `${artifactPathBasename(revision.path).replace(/\.[^.]*$/u, '')}.webp`;
        return await sendObject(request, reply, {
            body: () => storage.stream(artifactThumbnailKey(revision.objectKey)),
            contentType: 'image/webp',
            disposition: contentDisposition('inline', filename),
            etag: `"${revision.sha256}-thumbnail"`,
            size: null,
        });
    });
}

/** The current ready revision behind a live token, or null for every kind of miss. */
async function publicRevision(db: HausDatabase, token: string) {
    if (!artifactPublicTokenPattern.test(token)) {
        return null;
    }
    const [row] = await db
        .select({
            byteSize: revisions.byteSize,
            contentType: revisions.contentType,
            id: revisions.id,
            objectKey: revisions.objectKey,
            path: artifacts.path,
            sha256: revisions.sha256,
            thumbnailState: revisions.thumbnailState,
        })
        .from(artifacts)
        .innerJoin(serversTable, eq(serversTable.id, artifacts.serverId))
        .innerJoin(
            revisions,
            and(
                eq(revisions.serverId, artifacts.serverId),
                eq(revisions.artifactId, artifacts.id),
                eq(revisions.id, artifacts.currentRevisionId)
            )
        )
        .where(
            and(
                eq(artifacts.publicToken, token),
                isNull(artifacts.deletedAt),
                isNull(serversTable.deletedAt),
                eq(revisions.state, 'ready')
            )
        )
        .limit(1);
    return row?.sha256 ? { ...row, sha256: row.sha256 } : null;
}

async function sendObject(
    request: FastifyRequest,
    reply: FastifyReply,
    object: {
        body: () => ReadableStream<Uint8Array>;
        contentType: string;
        disposition: string;
        etag: string;
        size: number | null;
    }
) {
    reply.headers({
        ...publicResponseHeaders(object.contentType),
        'content-disposition': object.disposition,
        'content-type': object.contentType,
        etag: object.etag,
    });
    if (request.headers['if-none-match'] === object.etag) {
        return await reply.code(304).send();
    }
    if (object.size !== null) {
        reply.header('content-length', object.size);
    }
    // HEAD (Fastify answers it with this handler) needs the headers, not a storage read. An empty
    // stream, not `undefined`: Fastify's HEAD hook rewrites an undefined body to content-length 0.
    return await reply.send(request.method === 'HEAD' ? new ReadableStream() : object.body());
}

async function notFound(reply: FastifyReply) {
    return await reply
        .code(404)
        .headers({
            'cache-control': 'no-store',
            'content-type': 'text/plain; charset=utf-8',
            'x-content-type-options': 'nosniff',
        })
        .send('Not found');
}
