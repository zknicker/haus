import { and, eq, isNull } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import { readAvatar } from '../avatars/read-avatar.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { agentsTable } from '../postgres/schema.ts';
import {
    checkLinearUploadRevision,
    LinearArtifactUnavailableError,
    linearAvatarRoute,
    linearUploadSourceRoute,
    verifyLinearAvatarPath,
    verifyLinearUploadToken,
} from './signed-urls.ts';

// The two signed routes Linear's side fetches (specs/linear-app.md#signed-urls):
// an Agent's avatar for `displayIconUrl`, and one checked artifact revision for
// `upload_image`. Every refusal is the same bare 404.

const avatarMaxBytes = 1024 * 1024;

export interface LinearSignedUrlDependencies {
    db: HausDatabase;
    now?: () => number;
    /** `HAUS_LINEAR_URL_SIGNING_KEY`; without it every signed route answers 404. */
    signingKey: string | null;
    storage: ArtifactStorage | null;
}

export type LinearSignedBody =
    | { body: Uint8Array; contentType: string; status: 200 }
    | { status: 404 };

export function registerLinearSignedUrlRoutes(
    app: FastifyInstance,
    dependencies: LinearSignedUrlDependencies
) {
    app.get<{ Params: { agentId: string; exp: string; sig: string } }>(
        linearAvatarRoute,
        async (request, reply) => send(reply, await serveLinearAvatar(dependencies, request.params))
    );
    app.get<{ Params: { token: string } }>(linearUploadSourceRoute, async (request, reply) =>
        send(reply, await serveLinearUploadSource(dependencies, request.params.token))
    );
}

export async function serveLinearAvatar(
    dependencies: LinearSignedUrlDependencies,
    params: { agentId: string; exp: string; sig: string }
): Promise<LinearSignedBody> {
    const now = dependencies.now?.() ?? Date.now();
    if (
        !(dependencies.signingKey && verifyLinearAvatarPath(dependencies.signingKey, params, now))
    ) {
        return { status: 404 };
    }
    const [agent] = await dependencies.db
        .select({ avatarId: agentsTable.avatarId })
        .from(agentsTable)
        .where(and(eq(agentsTable.id, params.agentId), isNull(agentsTable.retiredAt)))
        .limit(1);
    const avatar = agent?.avatarId ? await readAvatar(dependencies.db, agent.avatarId) : null;
    if (!avatar || avatar.byteSize > avatarMaxBytes) {
        return { status: 404 };
    }
    return { body: avatar.bytes, contentType: avatar.mediaType, status: 200 };
}

/** Rechecks the revision at fetch time: a file deleted since minting is gone. */
export async function serveLinearUploadSource(
    dependencies: LinearSignedUrlDependencies,
    token: string
): Promise<LinearSignedBody> {
    const now = dependencies.now?.() ?? Date.now();
    const claim = dependencies.signingKey
        ? verifyLinearUploadToken(dependencies.signingKey, token, now)
        : null;
    if (!(claim && dependencies.storage)) {
        return { status: 404 };
    }
    let revision: Awaited<ReturnType<typeof checkLinearUploadRevision>>;
    try {
        revision = await checkLinearUploadRevision(dependencies.db, claim);
    } catch (cause) {
        if (cause instanceof LinearArtifactUnavailableError) {
            return { status: 404 };
        }
        throw cause;
    }
    const body = await dependencies.storage.read(revision.objectKey, revision.byteSize);
    if (body.byteLength !== revision.byteSize) {
        throw new Error('Stored artifact bytes do not match the revision size.');
    }
    return { body, contentType: revision.contentType, status: 200 };
}

async function send(reply: FastifyReply, result: LinearSignedBody) {
    if (result.status === 404) {
        return await reply.code(404).send({ code: 'not_found' });
    }
    reply.headers({
        'cache-control': 'no-store',
        'content-length': result.body.byteLength,
        'content-type': result.contentType,
        'x-content-type-options': 'nosniff',
    });
    return await reply.send(Buffer.from(result.body));
}
