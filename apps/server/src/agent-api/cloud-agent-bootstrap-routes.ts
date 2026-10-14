import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { claudeCloudHookScript } from '../cloud-agents/claude-cloud-hook-script.ts';
import {
    leaseCloudAgentCallback,
    readCloudAgentBootstrapStatus,
    registerCloudAgentBootstrap,
    revokeCloudAgentBootstrap,
    verifyCloudAgentBootstrap,
} from '../cloud-agents/cloud-agent-bootstrap.ts';
import {
    claimCloudAgentContinuation,
    readCloudAgentComputerWork,
} from '../cloud-agents/cloud-agent-computer-input.ts';
import { CloudAgentInputError } from '../cloud-agents/cloud-agent-input-store.ts';
import { acceptCloudAgentPrompt } from '../cloud-agents/cloud-agent-native-callback.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import { sendAgentApiError } from './auth.ts';

const computerAuth = { credentialHash: z.string().regex(/^[a-f0-9]{64}$/) };
const identity = z.string().min(1).max(200);
const registration = z
    .object({ ...computerAuth, token: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
    .strict();
const lease = z
    .object({
        workId: identity,
        runId: identity,
        sessionId: z.uuid(),
        promptId: identity,
        requestId: identity.optional(),
    })
    .strict();
const read = z.object({ ...computerAuth, workId: identity, runId: identity.optional() }).strict();
const continuation = z.object({ ...computerAuth, requestId: identity }).strict();
const verification = z
    .object({
        sessionId: z.uuid(),
        promptId: identity,
        protocolVersion: z.literal(1),
        remoteVersion: z.string().min(1).max(200),
    })
    .strict();

export function registerCloudAgentBootstrapRoutes(
    app: FastifyInstance,
    options: { db: HausDatabase; appOrigin: string; computers: ComputerConnections }
) {
    app.post('/computer/cloud-agents/bootstrap', async (request, reply) => {
        const input = registration.safeParse(request.body);
        if (!input.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'Invalid cloud bootstrap registration.'
            );
        }
        try {
            return await registerCloudAgentBootstrap(options.db, input.data);
        } catch (cause) {
            return failure(reply, cause);
        }
    });
    app.post('/computer/cloud-agents/bootstrap-status', async (request, reply) => {
        const input = z.object(computerAuth).strict().safeParse(request.body);
        if (!input.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'Invalid Computer authorization.');
        }
        try {
            return await readCloudAgentBootstrapStatus(options.db, input.data.credentialHash);
        } catch (cause) {
            return failure(reply, cause);
        }
    });
    app.post('/computer/cloud-agents/bootstrap-revoke', async (request, reply) => {
        const input = z.object(computerAuth).strict().safeParse(request.body);
        if (!input.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'Invalid Computer authorization.');
        }
        try {
            return await revokeCloudAgentBootstrap(options.db, input.data.credentialHash);
        } catch (cause) {
            return failure(reply, cause);
        }
    });
    app.post('/computer/cloud-agents/read', async (request, reply) => {
        const input = read.safeParse(request.body);
        if (!input.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'Invalid cloud execution read.');
        }
        try {
            return await readCloudAgentComputerWork(options.db, input.data);
        } catch (cause) {
            return failure(reply, cause);
        }
    });
    app.post('/computer/cloud-agents/continue', async (request, reply) => {
        const input = continuation.safeParse(request.body);
        if (!input.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'Invalid cloud continuation.');
        }
        try {
            return await claimCloudAgentContinuation(options.db, input.data);
        } catch (cause) {
            return failure(reply, cause);
        }
    });
    app.get('/api/cloud-agents/claude-hooks', (_request, reply) => {
        return reply.type('text/x-python').send(claudeCloudHookScript);
    });
    app.post('/api/cloud-agents/bootstrap/verify', async (request, reply) => {
        const input = verification.safeParse(request.body);
        if (!input.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'Invalid native hook verification.'
            );
        }
        try {
            return await verifyCloudAgentBootstrap(
                options.db,
                bootstrapHeader(request),
                input.data
            );
        } catch (cause) {
            return failure(reply, cause);
        }
    });
    app.post('/api/cloud-agents/bootstrap', async (request, reply) => {
        const input = lease.safeParse(request.body);
        if (!input.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'Invalid native cloud bootstrap.');
        }
        try {
            const leased = await leaseCloudAgentCallback(
                options.db,
                bootstrapHeader(request),
                input.data
            );
            const accepted = await acceptCloudAgentPrompt(options.db, leased.scope, {
                kind: 'prompt',
                sessionId: input.data.sessionId,
                promptId: input.data.promptId,
                ...(input.data.requestId ? { requestId: input.data.requestId } : {}),
            });
            for (const event of accepted.events) {
                publishRealtime(event);
            }
            options.computers.send(leased.scope.computerId, {
                type: 'cloud-agent-native-updated',
                workId: leased.scope.workId,
                runId: leased.scope.runId,
            });
            return {
                token: leased.token,
                callbackUrl: new URL('/api/cloud-agents/callback', options.appOrigin).href,
                request: accepted.request,
            };
        } catch (cause) {
            return failure(reply, cause);
        }
    });
}

function bootstrapHeader(request: FastifyRequest) {
    const token = request.headers['x-haus-cloud-bootstrap'];
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) {
        throw new CloudAgentInputError('A scoped cloud bootstrap credential is required.');
    }
    return token;
}
function failure(reply: import('fastify').FastifyReply, cause: unknown) {
    return cause instanceof CloudAgentInputError
        ? sendAgentApiError(reply, 409, 'CLOUD_AGENT_INPUT_CONFLICT', cause.message)
        : sendAgentApiError(reply, 500, 'SERVER_5XX', 'Cloud bootstrap operation failed.');
}
