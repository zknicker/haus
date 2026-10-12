import { randomUUID } from 'node:crypto';
import { artifactPublishInputSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import type { ArtifactActor } from '../artifacts/access.ts';
import { runArtifactAction } from '../artifacts/action.ts';
import { publishArtifact } from '../artifacts/publish.ts';
import { ArtifactError, type ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { registerAgentArtifactActions } from './artifact-actions.ts';
import { sendArtifactError } from './artifact-errors.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

export function registerAgentArtifactRoutes(
    app: FastifyInstance,
    options: {
        appOrigin: string;
        db: HausDatabase;
        storage: ArtifactStorage | null;
        budget: number;
    }
) {
    registerAgentArtifactActions(app, options);
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
                        const metadata = z.record(z.string(), z.unknown()).parse(request.query);
                        const input = artifactPublishInputSchema.parse({
                            ...metadata,
                            request_id: metadata.request_id ?? randomUUID(),
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
        offset: z.coerce.number().int().min(0).max(100_000).default(0),
        revision_id: z.string().optional(),
        query: z.string().trim().max(200).default(''),
        mine: z.enum(['true', 'false']).default('false'),
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
                                kind: 'all',
                                query: parsedQuery.query,
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
