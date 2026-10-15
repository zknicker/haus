import { randomUUID } from 'node:crypto';
import { artifactFolderSchema, artifactListPageMax } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import type { ArtifactActor } from '../artifacts/access.ts';
import { defaultArtifactListFilters, runArtifactAction } from '../artifacts/action.ts';
import { publishArtifact } from '../artifacts/publish.ts';
import { publishInputFromQuery } from '../artifacts/publish-route.ts';
import { ArtifactError, type ArtifactStorage } from '../artifacts/storage.ts';
import type { ArtifactThumbnails } from '../artifacts/thumbnails.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { registerAgentArtifactActions } from './artifact-actions.ts';
import { registerAgentArtifactDriveRoutes } from './artifact-drive-routes.ts';
import { sendArtifactError } from './artifact-errors.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

export function registerAgentArtifactRoutes(
    app: FastifyInstance,
    options: {
        appOrigin: string;
        db: HausDatabase;
        storage: ArtifactStorage | null;
        budget: number;
        thumbnails: ArtifactThumbnails | null;
    }
) {
    registerAgentArtifactActions(app, options);
    registerAgentArtifactDriveRoutes(app, options);
    for (const path of [
        '/api/agent/artifacts/publish-artifact-raw',
        '/api/agent/actions/publish-artifact-raw',
    ]) {
        app.post(
            path,
            {
                onRequest: async (request, reply) => {
                    try {
                        const runner = await authorizeAgentRunner(options.db, request);
                        if (!runner) {
                            return await sendAgentApiError(
                                reply,
                                401,
                                'MISSING_TOKEN',
                                'A valid runner credential is required.'
                            );
                        }
                        const input = publishInputFromQuery(request.query, {
                            request_id: randomUUID(),
                        });
                        if (
                            request.headers['content-type'] &&
                            request.headers['content-type'] !== 'application/octet-stream' &&
                            request.headers['content-type'] !== input.content_type
                        ) {
                            throw new ArtifactError(
                                'Use application/octet-stream for raw publishing.',
                                415,
                                'CONTENT_TYPE'
                            );
                        }
                        const result = await publishArtifact({
                            actor: { kind: 'agent', runner },
                            budget: options.budget,
                            db: options.db,
                            input,
                            origin: options.appOrigin,
                            storage: options.storage,
                            stream: request.raw,
                            thumbnails: options.thumbnails,
                        });
                        return await reply.send(result);
                    } catch (cause) {
                        return await sendArtifactError(reply, cause);
                    }
                },
            },
            async (_request, reply) => reply
        );
    }

    const target = z.object({ artifactId: z.string().min(1), revisionId: z.string().optional() });
    const query = z.object({
        limit: z.coerce.number().int().min(1).max(artifactListPageMax).default(50),
        mine: z.enum(['true', 'false']).default('false'),
        offset: z.coerce.number().int().min(0).max(100_000).default(0),
        order: z.enum(['updated', 'path']).default('updated'),
        prefix: artifactFolderSchema.default(''),
        query: z.string().trim().max(200).default(''),
        recursive: z.enum(['true', 'false']).default('false'),
        revision_id: z.string().optional(),
    });
    for (const action of [
        'list',
        'get',
        'versions',
        'download',
        'delete',
        'deleteVersion',
    ] as const) {
        const paths = {
            list: '',
            get: '/:artifactId',
            versions: '/:artifactId/versions',
            download: '/:artifactId/download',
            delete: '/:artifactId/delete',
            deleteVersion: '/:artifactId/versions/:revisionId/delete',
        };
        app.route({
            method: action.startsWith('delete') ? 'POST' : 'GET',
            url: `/api/agent/artifacts${paths[action]}`,
            handler: async (request, reply) => {
                try {
                    const runner = await authorizeAgentRunner(options.db, request);
                    if (!runner) {
                        return sendAgentApiError(
                            reply,
                            401,
                            'MISSING_TOKEN',
                            'A valid runner credential is required.'
                        );
                    }
                    const actor: ArtifactActor = { kind: 'agent', runner };
                    const origin = options.appOrigin;
                    const params =
                        action === 'list'
                            ? { artifactId: '', revisionId: undefined }
                            : target.parse(request.params);
                    const parsedQuery = query.parse(request.query);
                    return await runArtifactAction({
                        ...options,
                        action,
                        actor,
                        origin,
                        input: {
                            artifact_id: params.artifactId,
                            revision_id: params.revisionId ?? parsedQuery.revision_id,
                            offset: parsedQuery.offset,
                            filters: {
                                ...defaultArtifactListFilters,
                                limit: parsedQuery.limit,
                                order: parsedQuery.order,
                                prefix: parsedQuery.prefix,
                                query: parsedQuery.query,
                                recursive: parsedQuery.recursive === 'true',
                                // `mine` is the calling Agent's own creations; other creators stay unexposed.
                                creator:
                                    parsedQuery.mine === 'true'
                                        ? { type: 'agent', agent_id: runner.agentId }
                                        : undefined,
                            },
                        },
                    });
                } catch (cause) {
                    return sendArtifactError(reply, cause);
                }
            },
        });
    }
}
