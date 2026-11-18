import type { ArtifactPublicLinkResult } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { shareArtifact, unshareArtifact } from '../artifacts/public-link.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { sendArtifactError } from './artifact-errors.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

const params = z.object({ artifactId: z.string().min(1).max(128) });

/**
 * `haus files share`: `POST /api/agent/artifacts/:artifactId/public-link` creates or reuses the
 * file's public link, and `…/public-link/disable` disables it (specs/artifact-public-links.md).
 */
export function registerAgentArtifactPublicLinkRoutes(
    app: FastifyInstance,
    options: { appOrigin: string; db: HausDatabase }
) {
    for (const disable of [false, true]) {
        app.post(
            `/api/agent/artifacts/:artifactId/public-link${disable ? '/disable' : ''}`,
            async (request, reply) => {
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
                    const actor = { kind: 'agent', runner } as const;
                    const { artifactId } = params.parse(request.params);
                    let result: ArtifactPublicLinkResult;
                    if (disable) {
                        await unshareArtifact(options.db, actor, artifactId);
                        result = { artifact_id: artifactId, link: null };
                    } else {
                        const link = await shareArtifact(
                            options.db,
                            actor,
                            options.appOrigin,
                            artifactId
                        );
                        result = { artifact_id: artifactId, link };
                    }
                    return await reply.send(result);
                } catch (cause) {
                    return sendArtifactError(reply, cause);
                }
            }
        );
    }
}
