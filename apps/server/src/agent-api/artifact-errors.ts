import type { FastifyReply } from 'fastify';
import * as z from 'zod';
import { ArtifactError } from '../artifacts/storage.ts';
import { sendAgentApiError } from './auth.ts';

const pathFields = new Set<PropertyKey>(['path', 'prefix', 'from', 'to']);

export function sendArtifactError(reply: FastifyReply, cause: unknown) {
    if (cause instanceof ArtifactError) {
        if (cause.code === 'REVISION_CONFLICT') {
            // The conflict carries the head the write lost to, so the Agent can merge and retry.
            return reply
                .code(409)
                .send({ code: cause.code, current: cause.current, message: cause.message });
        }
        return sendAgentApiError(reply, cause.status, cause.code, cause.message);
    }
    if (cause instanceof z.ZodError) {
        const pathIssue = cause.issues.find((issue) => pathFields.has(issue.path[0] ?? ''));
        return pathIssue
            ? sendAgentApiError(
                  reply,
                  400,
                  'INVALID_PATH',
                  `${String(pathIssue.path[0])}: ${pathIssue.message}`
              )
            : sendAgentApiError(reply, 400, 'INVALID_ARG', cause.message);
    }
    reply.log.error(cause);
    return sendAgentApiError(
        reply,
        500,
        'SERVER_5XX',
        'The Server could not complete the artifact request.'
    );
}
