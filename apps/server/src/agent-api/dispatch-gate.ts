import { AGENT_DISPATCH_OUTCOME_UNKNOWN, AGENT_IDEMPOTENCY_KEY_REUSED } from '@haus/api';
import type { FastifyBaseLogger, FastifyReply } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import {
    claimDispatch,
    type DispatchResponse,
    type DispatchScope,
    finishDispatch,
    markDispatchUnknown,
} from './dispatch-store.ts';

export interface DispatchAttempt {
    fingerprint: string;
    route: string;
    scope: DispatchScope;
}

export type DispatchFinish = (
    status: number,
    payload: unknown,
    contentType: unknown
) => Promise<void>;

export function createDispatchGate(db: HausDatabase) {
    const flights = new Map<string, { fingerprint: string; outcome: Promise<DispatchResponse> }>();

    async function admit(reply: FastifyReply, attempt: DispatchAttempt) {
        const key = flightKey(attempt.scope);
        const flight = flights.get(key);
        if (flight) {
            return answer(
                reply,
                flight.fingerprint === attempt.fingerprint ? await flight.outcome : keyReused
            );
        }
        const outcome = Promise.withResolvers<DispatchResponse>();
        flights.set(key, { fingerprint: attempt.fingerprint, outcome: outcome.promise });
        const land = (response: DispatchResponse) => {
            flights.delete(key);
            outcome.resolve(response);
            return response;
        };
        const claim = await claimDispatch(db, attempt.scope, attempt).catch((cause: unknown) => {
            reply.log.error({ err: cause }, 'The Server could not claim an Agent dispatch.');
            return null;
        });
        if (!claim) {
            return answer(reply, land(claimFailed));
        }
        if (claim.state === 'claimed') {
            const finish: DispatchFinish = async (status, payload, contentType) => {
                land(
                    await settleRun(
                        db,
                        reply.log,
                        claim.id,
                        readResponse(status, payload, contentType)
                    )
                );
            };
            return { finish, kind: 'run' } as const;
        }
        if (claim.state === 'finished') {
            return answer(
                reply,
                land(claim.fingerprint === attempt.fingerprint ? claim.response : keyReused)
            );
        }
        if (claim.state === 'accepted') {
            await markDispatchUnknown(db, claim.id).catch((cause: unknown) => {
                reply.log.error({ err: cause }, 'The Server could not mark a dispatch unknown.');
            });
        }
        return answer(reply, land(outcomeUnknown));
    }

    return { admit };
}

const keyReused: DispatchResponse = {
    body: {
        code: AGENT_IDEMPOTENCY_KEY_REUSED,
        message: 'This dispatch id already belongs to a different request.',
    },
    status: 409,
};

const outcomeUnknown: DispatchResponse = {
    body: {
        code: AGENT_DISPATCH_OUTCOME_UNKNOWN,
        message:
            'An earlier attempt of this dispatch never finished, so whether it took effect is unknown. This request did nothing. Check for the effect before acting again.',
    },
    status: 409,
};

const claimFailed: DispatchResponse = {
    body: {
        code: 'SERVER_5XX',
        message: 'The Server could not record this dispatch. Nothing ran.',
        retryable: true,
    },
    status: 500,
};

async function settleRun(
    db: HausDatabase,
    log: FastifyBaseLogger,
    id: string,
    response: DispatchResponse | null
) {
    if (!response) {
        await markDispatchUnknown(db, id).catch((cause: unknown) => {
            log.error({ err: cause }, 'The Server could not mark a dispatch unknown.');
        });
        return outcomeUnknown;
    }
    await finishDispatch(db, id, response).catch((cause: unknown) => {
        log.error({ err: cause }, 'The Server could not store a dispatch response.');
    });
    return response;
}

function readResponse(status: number, payload: unknown, contentType: unknown) {
    if (!(typeof payload === 'string' && String(contentType).startsWith('application/json'))) {
        return null;
    }
    try {
        return { body: JSON.parse(payload) as unknown, status };
    } catch {
        return null;
    }
}

function answer(reply: FastifyReply, response: DispatchResponse) {
    reply
        .code(response.status)
        .type('application/json; charset=utf-8')
        .send(JSON.stringify(response.body));
    return { kind: 'answered' } as const;
}

function flightKey(scope: DispatchScope) {
    return JSON.stringify([scope.serverId, scope.agentId, scope.dispatchId]);
}
