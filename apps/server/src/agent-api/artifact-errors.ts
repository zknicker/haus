import type { FastifyReply } from 'fastify';
import * as z from 'zod';
import { ArtifactError } from '../artifacts/storage.ts';
import { sendAgentApiError } from './auth.ts';

export function sendArtifactError(reply: FastifyReply, cause: unknown) {
    if (cause instanceof ArtifactError) {
        return sendAgentApiError(reply, cause.status, cause.code, cause.message);
    }
    if (cause instanceof z.ZodError) {
        return sendAgentApiError(reply, 400, 'INVALID_ARG', cause.message);
    }
    reply.log.error(cause);
    return sendAgentApiError(
        reply,
        500,
        'SERVER_5XX',
        'The Server could not complete the artifact request.'
    );
}
