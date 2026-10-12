import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { type ArtifactAction, runArtifactAction } from '../artifacts/action.ts';
import type { ArtifactStorage } from '../artifacts/storage.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { sendArtifactError } from './artifact-errors.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

const inputs = z
    .object({
        artifact_id: z.string().min(1).optional(),
        offset: z.number().int().min(0).max(100_000).default(0),
        revision_id: z.string().min(1).optional(),
    })
    .strict();
const actions = {
    'list-artifacts': 'list',
    'get-artifact': 'get',
    'list-artifact-versions': 'versions',
    'delete-artifact': 'delete',
    'delete-artifact-version': 'deleteVersion',
} satisfies Record<string, ArtifactAction>;

export function registerAgentArtifactActions(
    app: FastifyInstance,
    options: { appOrigin: string; db: HausDatabase; storage: ArtifactStorage | null }
) {
    for (const [path, action] of Object.entries(actions)) {
        app.post(`/api/agent/actions/${path}`, async (request, reply) => {
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
                const input = inputs.parse(request.body ?? {});
                if (action !== 'list' && !input.artifact_id) {
                    return sendAgentApiError(reply, 400, 'INVALID_ARG', 'artifact_id is required.');
                }
                return await runArtifactAction({
                    ...options,
                    action,
                    actor: { kind: 'agent', runner },
                    origin: options.appOrigin,
                    input: { ...input, artifact_id: input.artifact_id ?? '' },
                });
            } catch (cause) {
                return sendArtifactError(reply, cause);
            }
        });
    }
}
