import { artifactPublishInputSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { sendArtifactError } from '../agent-api/artifact-errors.ts';
import { HausAuthError, type HausSessions } from '../identity/haus-sessions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { ServerAccessDeniedError, ServerNotFoundError } from '../servers/server-access.ts';
import { findUserById } from '../users/haus-user.ts';
import { publishArtifact } from './publish.ts';
import { ArtifactError, type ArtifactStorage } from './storage.ts';
import type { ArtifactThumbnails } from './thumbnails.ts';

const publishQuery = z
    .object({ replace: z.enum(['true', 'false']).optional() })
    .catchall(z.unknown());

/** Raw-publish metadata rides the query string, so `replace` arrives as text. */
export function publishInputFromQuery(query: unknown, defaults: { request_id?: string } = {}) {
    const { replace, ...metadata } = publishQuery.parse(query);
    return artifactPublishInputSchema.parse({
        ...defaults,
        ...metadata,
        replace: replace === 'true',
    });
}

/**
 * The App's write path: `PUT /artifacts/:serverId/publish` with raw bytes and the same query
 * metadata as the Agent raw-publish route (`path`, `base_revision_id` or `replace`,
 * `request_id`, optional `title` and `content_type`). Errors use the Agent API body shape.
 */
export function registerArtifactPublishRoute(
    app: FastifyInstance,
    options: {
        appOrigin: string;
        budget: number;
        hausSessions: HausSessions;
        db: HausDatabase;
        storage: ArtifactStorage | null;
        thumbnails: ArtifactThumbnails | null;
    }
) {
    app.put<{ Params: { serverId: string } }>(
        '/artifacts/:serverId/publish',
        {
            // Consume the raw stream before Fastify's body parser can buffer it.
            onRequest: async (request, reply) => {
                try {
                    const userId = await authenticate(
                        options.hausSessions,
                        request.headers.authorization
                    );
                    if (
                        request.headers['content-type']?.toLowerCase() !==
                        'application/octet-stream'
                    ) {
                        throw new ArtifactError(
                            'Use application/octet-stream for raw publishing.',
                            415,
                            'CONTENT_TYPE'
                        );
                    }
                    const input = publishInputFromQuery(request.query);
                    const result = await publishArtifact({
                        actor: {
                            kind: 'human',
                            member: await findUserById(options.db, userId),
                            serverId: request.params.serverId,
                        },
                        budget: options.budget,
                        db: options.db,
                        input,
                        origin: options.appOrigin,
                        storage: options.storage,
                        stream: request.raw,
                        thumbnails: options.thumbnails,
                    });
                    await reply.send(result);
                } catch (cause) {
                    await sendArtifactError(reply, membershipError(cause));
                }
            },
        },
        async (_request, reply) => reply
    );
}

async function authenticate(sessions: HausSessions, authorization: string | undefined) {
    if (!authorization?.startsWith('Bearer ')) {
        throw new ArtifactError('Sign in to publish shared files.', 401, 'UNAUTHORIZED');
    }
    try {
        return (await sessions.authenticate(authorization.slice(7))).userId;
    } catch (cause) {
        if (cause instanceof HausAuthError && cause.code === 'auth_unavailable') {
            throw new ArtifactError(cause.message, 503, 'AUTH_UNAVAILABLE');
        }
        throw new ArtifactError('Sign in to publish shared files.', 401, 'UNAUTHORIZED');
    }
}

function membershipError(cause: unknown) {
    if (cause instanceof ServerAccessDeniedError) {
        return new ArtifactError(cause.message, 403, 'FORBIDDEN');
    }
    if (cause instanceof ServerNotFoundError) {
        return new ArtifactError(cause.message, 404, 'NOT_FOUND');
    }
    return cause;
}
