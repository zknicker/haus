import { artifactMoveInputSchema, artifactResolveInputSchema } from '@haus/api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ArtifactActor } from '../artifacts/access.ts';
import { moveArtifacts } from '../artifacts/move.ts';
import { getArtifactAtPath } from '../artifacts/read.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { sendArtifactError } from './artifact-errors.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

const moveBody = artifactMoveInputSchema.omit({ serverId: true });
const resolveQuery = artifactResolveInputSchema.omit({ serverId: true });

/** Path-addressed drive routes: exact path lookup and file or folder moves. */
export function registerAgentArtifactDriveRoutes(
    app: FastifyInstance,
    options: { appOrigin: string; db: HausDatabase }
) {
    app.get(
        '/api/agent/artifacts/by-path',
        async (request, reply) =>
            await withAgent(options.db, request, reply, async (actor) => ({
                artifact: await getArtifactAtPath(
                    options.db,
                    actor,
                    options.appOrigin,
                    resolveQuery.parse(request.query).path
                ),
            }))
    );
    app.post(
        '/api/agent/artifacts/move',
        async (request, reply) =>
            await withAgent(options.db, request, reply, async (actor) =>
                moveArtifacts(
                    options.db,
                    actor,
                    options.appOrigin,
                    moveBody.parse(request.body ?? {})
                )
            )
    );
}

async function withAgent(
    db: HausDatabase,
    request: FastifyRequest,
    reply: FastifyReply,
    run: (actor: ArtifactActor) => Promise<unknown>
) {
    try {
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        return await run({ kind: 'agent', runner });
    } catch (cause) {
        return sendArtifactError(reply, cause);
    }
}
