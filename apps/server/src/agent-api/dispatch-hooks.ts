import { createHash, type Hash } from 'node:crypto';
import { Transform, type Readable } from 'node:stream';
import { AGENT_DISPATCH_ID_HEADER, dispatchIdOf, parseDispatchId } from '@haus/api';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { HausDatabase } from '../postgres/connection.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';
import { createDispatchGate, type DispatchFinish } from './dispatch-gate.ts';
import type { DispatchScope } from './dispatch-store.ts';

const mutatingMethods = new Set(['DELETE', 'PATCH', 'POST', 'PUT']);

// WARNING: a route that streams its body in its own onRequest hook must be listed here, or it runs ungated.
const streamedRoutes = new Set([
    '/api/agent/actions/publish-artifact-raw',
    '/api/agent/artifacts/publish-artifact-raw',
]);

interface PendingDispatch {
    hash: Hash;
    route: string;
    scope: DispatchScope;
}

export function registerAgentDispatchIds(app: FastifyInstance, db: HausDatabase) {
    const gate = createDispatchGate(db);
    const pending = new WeakMap<FastifyRequest, PendingDispatch>();
    const running = new WeakMap<FastifyRequest, DispatchFinish>();

    async function admit(request: FastifyRequest, reply: FastifyReply, dispatch: PendingDispatch) {
        const admission = await gate.admit(reply, {
            fingerprint: dispatch.hash.digest('hex'),
            route: dispatch.route,
            scope: dispatch.scope,
        });
        if (admission.kind === 'run') {
            running.set(request, admission.finish);
            return;
        }
        return reply;
    }

    app.addHook('onRequest', async (request, reply) => {
        const route = request.routeOptions.url;
        const header = request.headers[AGENT_DISPATCH_ID_HEADER];
        if (
            !(route?.startsWith('/api/agent/') && mutatingMethods.has(request.method)) ||
            header === undefined
        ) {
            return;
        }
        const key = typeof header === 'string' ? parseDispatchId(header) : null;
        if (!key) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'Haus-Dispatch-Id must be <runId>:<toolCallId>:<seq>.'
            );
        }
        const runner = await authorizeAgentRunner(db, request);
        if (!runner) {
            return;
        }
        if (runner.runId !== key.runId) {
            return sendAgentApiError(
                reply,
                403,
                'DISPATCH_RUN_MISMATCH',
                'Haus-Dispatch-Id names a different run than this credential.'
            );
        }
        const dispatch: PendingDispatch = {
            hash: createHash('sha256').update(`${request.method}\n${route}\n${request.url}\n`),
            route,
            scope: {
                agentId: runner.agentId,
                dispatchId: dispatchIdOf(key),
                runId: runner.runId,
                serverId: runner.serverId,
            },
        };
        if (!streamedRoutes.has(route)) {
            pending.set(request, dispatch);
            return;
        }
        dispatch.hash.update(
            `${request.headers['content-type'] ?? ''}\n${request.headers['content-length'] ?? ''}`
        );
        return await admit(request, reply, dispatch);
    });

    app.addHook('preParsing', async (request, _reply, payload) => {
        const dispatch = pending.get(request);
        return dispatch ? hashInto(dispatch.hash, payload) : payload;
    });

    app.addHook('preHandler', async (request, reply) => {
        const dispatch = pending.get(request);
        if (!dispatch) {
            return;
        }
        pending.delete(request);
        return await admit(request, reply, dispatch);
    });

    app.addHook('onSend', async (request, reply, payload) => {
        const finish = running.get(request);
        if (finish) {
            running.delete(request);
            await finish(reply.statusCode, payload, reply.getHeader('content-type'));
        }
        return payload;
    });
}

function hashInto(hash: Hash, payload: Readable) {
    const tee = new Transform({
        transform(chunk: Buffer, _encoding, done) {
            hash.update(chunk);
            done(null, chunk);
        },
    });
    payload.once('error', (cause) => tee.destroy(cause));
    return payload.pipe(tee);
}
