import { AGENT_IDEMPOTENCY_KEY_REUSED } from '@haus/api';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { ChatArchivedError } from '../chats/chat-access.ts';
import { resolveRunnerCredential } from '../computers/runner-credentials.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { AgentTargetError } from './resolve-target.ts';
import { AgentTaskError, AgentTaskNonceReusedError } from './task-error.ts';

export async function authorizeAgentRunner(db: HausDatabase, request: FastifyRequest) {
    const header = request.headers.authorization;
    const value = Array.isArray(header) ? header[0] : header;
    const token = typeof value === 'string' && value.startsWith('Bearer ') ? value.slice(7) : null;
    return token ? await resolveRunnerCredential(db, token) : null;
}

export function sendAgentApiError(
    reply: FastifyReply,
    status: number,
    code: string,
    message: string,
    options: {
        handle?: string;
        nextAction?: string;
        retryable?: boolean;
    } = {}
) {
    return reply.code(status).send({ code, message, ...options });
}

export function sendAgentReadError(reply: FastifyReply, cause: unknown) {
    if (cause instanceof AgentTargetError) {
        return sendAgentApiError(reply, 404, 'INVALID_TARGET', cause.message);
    }
    if (cause instanceof AgentTaskNonceReusedError) {
        return sendAgentApiError(reply, 409, AGENT_IDEMPOTENCY_KEY_REUSED, cause.message);
    }
    if (cause instanceof AgentTaskError) {
        return sendAgentApiError(reply, 409, 'TASK_CONFLICT', cause.message);
    }
    if (cause instanceof ChatArchivedError) {
        return sendAgentApiError(reply, 409, 'TARGET_READ_ONLY', cause.message);
    }
    return sendAgentApiError(reply, 500, 'SERVER_5XX', 'The Server could not read messages.');
}
