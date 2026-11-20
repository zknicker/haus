import type { FastifyRequest } from 'fastify';
import type { ArtifactActor } from '../artifacts/access.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { resolveWorkerCredential } from '../workers/worker-credentials.ts';
import { authorizeAgentRunner } from './auth.ts';

export async function authorizeWorkerTurn(db: HausDatabase, request: FastifyRequest) {
    const token = bearerToken(request);
    const scope = token ? await resolveWorkerCredential(db, token) : null;
    return scope?.kind === 'turn' ? scope : null;
}

export async function authorizeDriveReader(db: HausDatabase, request: FastifyRequest) {
    return await authorizeDriveActor(db, request, ['turn', 'push']);
}

export async function authorizeDrivePusher(db: HausDatabase, request: FastifyRequest) {
    return await authorizeDriveActor(db, request, ['push']);
}

async function authorizeDriveActor(
    db: HausDatabase,
    request: FastifyRequest,
    kinds: ReadonlyArray<'push' | 'turn'>
) {
    const runner = await authorizeAgentRunner(db, request);
    if (runner) {
        return { kind: 'agent', runner } satisfies ArtifactActor;
    }
    const token = bearerToken(request);
    const scope = token ? await resolveWorkerCredential(db, token) : null;
    if (!(scope?.live && kinds.includes(scope.kind))) {
        return null;
    }
    return {
        kind: 'worker',
        worker: {
            agentId: scope.agentId,
            serverId: scope.serverId,
            turnId: scope.turnId,
            workerId: scope.workerId,
        },
    } satisfies ArtifactActor;
}

function bearerToken(request: FastifyRequest) {
    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    return typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : null;
}
