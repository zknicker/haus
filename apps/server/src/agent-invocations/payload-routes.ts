import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import * as z from 'zod';
import { authorizeAgentRunner } from '../agent-api/auth.ts';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import { AttachmentUploadError } from '../attachments/attachment-upload-model.ts';
import { attachmentMaxSizeBytes } from '../attachments/reserve-attachment.ts';
import {
    ComputerSetupDeniedError,
    hashComputerSecret,
    resolveComputerCredential,
} from '../computers/service.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerRuntime } from '../server-runtime.ts';
import {
    InvocationPayloadError,
    openComputerPayload,
    openRunPayload,
    storeInvocationPayload,
} from './invocation-payloads.ts';

const invocationParamsSchema = z.object({
    invocationId: z.string().regex(/^inv_[A-Za-z0-9_-]{16}$/u),
});
const payloadParamsSchema = invocationParamsSchema.extend({
    attachmentId: z.string().regex(/^att_[A-Za-z0-9_-]{16}$/u),
});
const mediaTypeSchema = z.string().trim().min(1).max(255);

export function registerInvocationPayloadRoutes(
    app: FastifyInstance,
    options: { db: HausDatabase; root: AttachmentRoot; runtime: ServerRuntime }
) {
    const { db, root } = options;
    app.put(
        '/computer/invocations/:invocationId/payloads',
        {
            onRequest: async (request, reply) => {
                try {
                    const computer = await authorizeComputer(db, request);
                    const { invocationId } = parse(invocationParamsSchema, request.params);
                    const mediaType = parse(mediaTypeSchema, request.headers['content-type']);
                    const stored = await storeInvocationPayload(db, root, options.runtime, {
                        computer,
                        declaredLength: contentLength(request.headers['content-length']),
                        invocationId,
                        mediaType,
                        stream: request.raw,
                    });
                    await reply.send(stored);
                } catch (error) {
                    await sendPayloadError(reply, error);
                }
            },
        },
        async (_request, reply) => reply
    );
    app.get(
        '/computer/invocations/:invocationId/payloads/:attachmentId',
        async (request, reply) => {
            try {
                const computer = await authorizeComputer(db, request);
                const params = parse(payloadParamsSchema, request.params);
                return await sendPayload(
                    reply,
                    await openComputerPayload(db, root, { ...params, computer })
                );
            } catch (error) {
                return await sendPayloadError(reply, error);
            }
        }
    );
    app.get('/api/agent/invocation-payloads/:attachmentId', async (request, reply) => {
        try {
            const runner = await authorizeAgentRunner(db, request);
            if (!runner) {
                throw new InvocationPayloadError('The run credential was rejected.', 401);
            }
            const { attachmentId } = parse(
                payloadParamsSchema.omit({ invocationId: true }),
                request.params
            );
            return await sendPayload(reply, await openRunPayload(db, root, runner, attachmentId));
        } catch (error) {
            return await sendPayloadError(reply, error);
        }
    });
}

async function authorizeComputer(db: HausDatabase, request: FastifyRequest) {
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
        throw new InvocationPayloadError('A Computer credential is required.', 401);
    }
    try {
        return await resolveComputerCredential(db, hashComputerSecret(header.slice(7)));
    } catch (cause) {
        if (cause instanceof ComputerSetupDeniedError) {
            throw new InvocationPayloadError(cause.message, 401);
        }
        throw cause;
    }
}

function sendPayload(reply: FastifyReply, payload: Awaited<ReturnType<typeof openRunPayload>>) {
    reply.headers({
        'cache-control': 'no-store',
        'content-length': payload.sizeBytes,
        'content-type': payload.mediaType,
        'x-content-type-options': 'nosniff',
    });
    return reply.send(payload.file.createReadStream());
}

function sendPayloadError(reply: FastifyReply, error: unknown) {
    if (error instanceof InvocationPayloadError) {
        return reply.code(error.status).send({ error: error.message });
    }
    if (error instanceof AttachmentUploadError) {
        const status = {
            conflict: 409,
            forbidden: 403,
            length_mismatch: 400,
            not_found: 404,
            size_limit: 413,
        }[error.code];
        return reply.code(status).send({ error: error.message });
    }
    reply.log.error(error);
    return reply.code(500).send({ error: 'The invocation payload request failed.' });
}

function parse<Value>(schema: z.ZodType<Value>, value: unknown) {
    const parsed = schema.safeParse(value);
    if (!parsed.success) {
        throw new InvocationPayloadError('The invocation payload request was invalid.', 400);
    }
    return parsed.data;
}

function contentLength(value: string | undefined) {
    if (value === undefined) {
        return null;
    }
    const length = Number(value);
    if (!(/^(0|[1-9]\d*)$/u.test(value) && Number.isSafeInteger(length))) {
        throw new InvocationPayloadError('Content-Length must be a nonnegative integer.', 400);
    }
    if (length > attachmentMaxSizeBytes) {
        throw new InvocationPayloadError('The payload exceeds the 50 MiB limit.', 413);
    }
    return length;
}
