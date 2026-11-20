import { createHash } from 'node:crypto';
import {
    type WorkerPushCredentialRequest,
    type WorkerTurnCredentialRequest,
    workerPushCredentialResponseSchema,
    workerTurnCredentialResponseSchema,
} from '@haus/api';

export interface WorkerServer {
    credential: string;
    serverOrigin: string;
}

export async function mintTurnCredential(
    server: WorkerServer,
    turn: { attempt: number; turnId: string }
) {
    const request: WorkerTurnCredentialRequest = {
        attempt: turn.attempt,
        credentialHash: credentialHashOf(server),
        turnId: turn.turnId,
    };
    return workerTurnCredentialResponseSchema.parse(
        await postMint(server, '/computer/workers/turn-credential', request)
    );
}

export async function mintPushCredential(server: WorkerServer, turnId: string) {
    const request: WorkerPushCredentialRequest = {
        credentialHash: credentialHashOf(server),
        turnId,
    };
    return workerPushCredentialResponseSchema.parse(
        await postMint(server, '/computer/workers/push-credential', request)
    );
}

async function postMint(server: WorkerServer, path: string, body: object) {
    const response = await fetch(new URL(path, server.serverOrigin), {
        body: JSON.stringify(body),
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: AbortSignal.timeout(30_000),
    });
    const payload = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
        throw new Error(`The Server refused ${path} with ${response.status}.`);
    }
    return payload;
}

function credentialHashOf(server: WorkerServer) {
    return createHash('sha256').update(server.credential).digest('hex');
}
