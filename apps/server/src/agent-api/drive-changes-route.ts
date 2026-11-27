import { driveChangesInputSchema } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { ArtifactError } from '../artifacts/storage.ts';
import { readDriveChanges } from '../drive/changes-query.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { sendArtifactError } from './artifact-errors.ts';
import { sendAgentApiError } from './auth.ts';
import { authorizeDriveAgent } from './drive-auth.ts';

const changesQuery = z.object({ since: z.string().optional(), until: z.string().optional() });

export function registerAgentDriveChangesRoute(
    app: FastifyInstance,
    options: { db: HausDatabase }
) {
    app.get('/api/agent/drive/changes', async (request, reply) => {
        try {
            const actor = await authorizeDriveAgent(options.db, request);
            if (!actor) {
                return sendAgentApiError(
                    reply,
                    401,
                    'MISSING_TOKEN',
                    'A valid runner credential is required.'
                );
            }
            const query = changesQuery.parse(request.query);
            const input = driveChangesInputSchema.parse({
                serverId: actor.runner.serverId,
                since: jsonParam('since', query.since),
                until: jsonParam('until', query.until),
            });
            return await readDriveChanges(options.db, actor, input);
        } catch (cause) {
            return sendArtifactError(reply, cause);
        }
    });
}

function jsonParam(name: string, value: string | undefined) {
    if (value === undefined) {
        return undefined;
    }
    try {
        return JSON.parse(value) as unknown;
    } catch {
        throw new ArtifactError(
            `${name} must be a JSON object of area counters.`,
            400,
            'INVALID_ARG'
        );
    }
}
