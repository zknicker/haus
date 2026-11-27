import type { FastifyRequest } from 'fastify';
import type { ArtifactActor } from '../artifacts/access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { authorizeAgentRunner } from './auth.ts';

export async function authorizeDriveAgent(db: HausDatabase, request: FastifyRequest) {
    const runner = await authorizeAgentRunner(db, request);
    return runner ? ({ kind: 'agent', runner } satisfies ArtifactActor) : null;
}
