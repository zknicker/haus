import { createHash } from 'node:crypto';
import { workerPushCredentialResponseSchema, workerTurnCredentialResponseSchema } from '@haus/api';

export interface WorkerServer {
    credential: string;
    serverOrigin: string;
}

export async function mintTurnCredential(
    server: WorkerServer,
    turn: { attempt: number; turnId: string }
) {
    return workerTurnCredentialResponseSchema.parse(
        await postMint(server, '/computer/workers/turn-credential', turn)
    );
}

export async function mintPushCredential(server: WorkerServer, turnId: string) {
    return workerPushCredentialResponseSchema.parse(
        await postMint(server, '/computer/workers/push-credential', { turnId })
    );
}

async function postMint(server: WorkerServer, path: string, body: object) {
    const response = await fetch(new URL(path, server.serverOrigin), {
        body: JSON.stringify({
            ...body,
            credentialHash: createHash('sha256').update(server.credential).digest('hex'),
        }),
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
