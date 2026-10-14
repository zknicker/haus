import {
    type CloudAgentCallback,
    cloudAgentCallbackCredentialSchema,
    cloudAgentCallbackSchema,
    cloudAgentInputAnswerSchema,
} from '@haus/api';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { AgentDelivery } from '../agent-delivery/delivery.ts';
import {
    answerCloudAgentInput,
    consumeCloudAgentInput,
} from '../cloud-agents/answer-cloud-agent-input.ts';
import {
    authorizeCloudAgentCallback,
    type CloudAgentCallbackScope,
    CloudAgentInputError,
    listCloudAgentInput,
    readCloudAgentInput,
    requireLiveCloudRun,
    requireOwnedCloudRun,
} from '../cloud-agents/cloud-agent-input-store.ts';
import {
    acceptCloudAgentPrompt,
    registerCloudAgentCallbackCredential,
    settleCloudAgentNativePrompt,
} from '../cloud-agents/cloud-agent-native-callback.ts';
import { registerCloudAgentInput } from '../cloud-agents/register-cloud-agent-input.ts';
import type { ComputerConnections } from '../computers/connections.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { publishRealtime } from '../realtime/topic.ts';
import type { ServerPostCommitWork } from '../server-post-commit-work.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

const query = z.object({ workId: z.string().min(1) }).strict();
const requestParams = z.object({ requestId: z.string().min(1) }).strict();
export function registerCloudAgentInputRoutes(
    app: FastifyInstance,
    options: {
        db: HausDatabase;
        agentDelivery: AgentDelivery;
        postCommitWork: ServerPostCommitWork;
        appOrigin: string;
        computers: ComputerConnections;
    }
) {
    app.post('/api/agent/cloud-agents/callback-credential', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const input = cloudAgentCallbackCredentialSchema.safeParse(request.body);
        if (!input.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'The callback credential request was invalid.'
            );
        }
        try {
            await registerCloudAgentCallbackCredential(options.db, runner, input.data);
            return {
                workId: input.data.workId,
                runId: input.data.runId,
                callbackUrl: new URL('/api/cloud-agents/callback', options.appOrigin).href,
            };
        } catch (cause) {
            return inputFailure(reply, cause);
        }
    });
    app.get('/api/agent/cloud-agents/input', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const input = query.safeParse(request.query);
        if (!input.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'Select the Cloud Agent work.');
        }
        try {
            await requireOwnedCloudRun(options.db, runner, input.data.workId);
            return {
                requests: await listCloudAgentInput(options.db, runner.serverId, input.data.workId),
            };
        } catch (cause) {
            return inputFailure(reply, cause);
        }
    });
    app.post('/api/agent/cloud-agents/input/answer', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        if (!runner) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A valid runner credential is required.'
            );
        }
        const input = cloudAgentInputAnswerSchema.safeParse(request.body);
        if (!input.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'The Cloud Agent answer was invalid.'
            );
        }
        try {
            const answered = await answerCloudAgentInput(
                options.db,
                runner,
                input.data.id,
                input.data.answer
            );
            const work = await requireOwnedCloudRun(options.db, runner, answered.workId);
            options.computers.send(work.computerId, {
                type: 'cloud-agent-input-answered',
                workId: answered.workId,
                runId: answered.runId,
                requestId: answered.id,
            });
            return { request: answered };
        } catch (cause) {
            return inputFailure(reply, cause);
        }
    });
    app.get('/api/cloud-agents/input/:requestId', async (request, reply) => {
        const scope = await callbackScope(options.db, request);
        if (!scope) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A scoped callback credential is required.'
            );
        }
        const input = requestParams.safeParse(request.params);
        if (!input.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The input identity was invalid.');
        }
        try {
            const value = await readCloudAgentInput(
                options.db,
                scope.serverId,
                input.data.requestId
            );
            if (value.runId !== scope.runId) {
                throw new CloudAgentInputError('Input belongs to another execution.');
            }
            if (value.state === 'pending' || value.state === 'answered') {
                await requireLiveCloudRun(options.db, scope);
            }
            return { request: value };
        } catch (cause) {
            return inputFailure(reply, cause);
        }
    });
    app.post('/api/cloud-agents/callback', async (request, reply) => {
        const scope = await callbackScope(options.db, request);
        if (!scope) {
            return sendAgentApiError(
                reply,
                401,
                'MISSING_TOKEN',
                'A scoped callback credential is required.'
            );
        }
        const input = cloudAgentCallbackSchema.safeParse(request.body);
        if (!input.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The native callback was invalid.');
        }
        try {
            const result = await dispatchCallback(
                options.db,
                scope,
                input.data,
                options.agentDelivery
            );
            for (const event of result.events) {
                publishRealtime(event);
            }
            options.computers.send(scope.computerId, {
                type: 'cloud-agent-native-updated',
                workId: scope.workId,
                runId: scope.runId,
            });
            if ('wake' in result && result.wake) {
                void options.postCommitWork.wakeAgents(options.agentDelivery, [result.wake]);
            }
            return 'request' in result ? { request: result.request } : { settled: result.settled };
        } catch (cause) {
            return inputFailure(reply, cause);
        }
    });
}

function dispatchCallback(
    db: HausDatabase,
    scope: CloudAgentCallbackScope,
    input: CloudAgentCallback,
    delivery: AgentDelivery
) {
    switch (input.kind) {
        case 'prompt':
            return acceptCloudAgentPrompt(db, scope, input);
        case 'question':
            return registerCloudAgentInput(db, scope, input, delivery);
        case 'consume':
            return consumeCloudAgentInput(db, scope, input);
        case 'stop':
        case 'failure':
            return settleCloudAgentNativePrompt(db, scope, input, delivery);
    }
}

async function callbackScope(db: HausDatabase, request: FastifyRequest) {
    const value = request.headers['x-haus-cloud-run'];
    const token = typeof value === 'string' && /^[A-Za-z0-9_-]{43}$/u.test(value) ? value : null;
    return token ? await authorizeCloudAgentCallback(db, token) : null;
}
function inputFailure(reply: import('fastify').FastifyReply, cause: unknown) {
    return cause instanceof CloudAgentInputError
        ? sendAgentApiError(reply, 409, 'CLOUD_AGENT_INPUT_CONFLICT', cause.message)
        : sendAgentApiError(reply, 500, 'SERVER_5XX', 'The Cloud Agent input operation failed.');
}
