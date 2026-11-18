import type { FastifyInstance, FastifyReply } from 'fastify';
import {
    ChatAccessDeniedError,
    ChatArchivedError,
    ChatNotFoundError,
} from '../chats/chat-access.ts';
import { HausAuthError, type HausSessions } from '../identity/haus-sessions.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import type { ServerRuntime } from '../server-runtime.ts';
import { ServerAccessDeniedError, ServerNotFoundError } from '../servers/server-access.ts';
import { findUserById } from '../users/haus-user.ts';
import { attachmentDisposition } from '../utils/content-disposition.ts';
import type { AttachmentRoot } from './attachment-root.ts';
import { openAttachmentDownload } from './download-attachment.ts';
import { attachmentMaxSizeBytes } from './reserve-attachment.ts';
import { AttachmentUploadError, uploadAttachment } from './upload-attachment.ts';

interface AttachmentRouteDependencies {
    db: HausDatabase;
    hausSessions: HausSessions;
    root: AttachmentRoot;
    runtime: ServerRuntime;
}

interface AttachmentParams {
    attachmentId: string;
    serverId: string;
}

export async function registerAttachmentRoutes(
    app: FastifyInstance,
    dependencies: AttachmentRouteDependencies
) {
    app.get<{ Params: AttachmentParams }>(
        '/attachments/:serverId/:attachmentId',
        async (request, reply) => {
            try {
                const userId = await authenticate(
                    dependencies.hausSessions,
                    request.headers.authorization
                );
                const member = await findUserById(dependencies.db, userId);
                const download = await openAttachmentDownload(
                    dependencies.db,
                    dependencies.root,
                    member,
                    request.params
                );

                reply.headers({
                    // Attachment bytes never change under an id; only this viewer's cache keeps them.
                    'cache-control': 'private, max-age=31536000, immutable',
                    'content-disposition': attachmentDisposition(download.filename),
                    'content-length': download.sizeBytes,
                    'content-type': download.mediaType,
                    'x-content-type-options': 'nosniff',
                });
                return await reply.send(download.file.createReadStream());
            } catch (error) {
                return sendAttachmentError(reply, error);
            }
        }
    );

    app.put<{ Params: AttachmentParams }>(
        '/attachments/:serverId/:attachmentId',
        {
            // Consume the raw stream before Fastify's body parser can buffer it.
            onRequest: async (request, reply) => {
                try {
                    const userId = await authenticate(
                        dependencies.hausSessions,
                        request.headers.authorization
                    );
                    requireOctetStream(request.headers['content-type']);
                    const member = await findUserById(dependencies.db, userId);
                    const declaredLength = parseContentLength(request.headers['content-length']);
                    const result = await uploadAttachment(
                        dependencies.db,
                        dependencies.root,
                        dependencies.runtime,
                        {
                            attachmentId: request.params.attachmentId,
                            declaredLength,
                            member,
                            serverId: request.params.serverId,
                            stream: request.raw,
                        }
                    );

                    await reply.send(result);
                } catch (error) {
                    await sendAttachmentError(reply, error);
                }
            },
        },
        async (_request, reply) => reply
    );
}

async function authenticate(sessions: HausSessions, authorization: string | undefined) {
    if (!authorization?.startsWith('Bearer ')) {
        throw new RouteError('Sign in to upload attachments.', 401);
    }

    try {
        return (await sessions.authenticate(authorization.slice(7))).userId;
    } catch (cause) {
        if (cause instanceof HausAuthError && cause.code === 'auth_unavailable') {
            throw new RouteError(cause.message, 503, { cause });
        }

        throw new RouteError('Sign in to upload attachments.', 401, { cause });
    }
}

function parseContentLength(value: string | undefined) {
    if (value === undefined) {
        return null;
    }
    if (!/^(0|[1-9]\d*)$/u.test(value)) {
        throw new RouteError('Content-Length must be a nonnegative integer.', 400);
    }

    const length = Number(value);
    if (!Number.isSafeInteger(length)) {
        throw new RouteError('Content-Length is too large.', 413);
    }
    if (length > attachmentMaxSizeBytes) {
        throw new RouteError('Attachment exceeds the 50 MiB limit.', 413);
    }
    return length;
}

function requireOctetStream(value: string | undefined) {
    if (value?.toLowerCase() !== 'application/octet-stream') {
        throw new RouteError('Attachment uploads require application/octet-stream.', 415);
    }
}

function sendAttachmentError(reply: FastifyReply, error: unknown) {
    if (error instanceof RouteError) {
        return reply.code(error.status).send({ error: error.message });
    }
    if (error instanceof ChatAccessDeniedError) {
        return reply.code(403).send({ error: error.message });
    }
    if (error instanceof ServerAccessDeniedError) {
        return reply.code(403).send({ error: error.message });
    }
    if (error instanceof ChatArchivedError) {
        return reply.code(409).send({ error: error.message });
    }
    if (error instanceof ChatNotFoundError || error instanceof ServerNotFoundError) {
        return reply.code(404).send({ error: error.message });
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

    requestLog(reply, error);
    return reply.code(500).send({ error: 'Attachment upload failed.' });
}

function requestLog(reply: FastifyReply, error: unknown) {
    reply.log.error(error);
}

class RouteError extends Error {
    constructor(
        message: string,
        readonly status: 400 | 401 | 413 | 415 | 503,
        options?: ErrorOptions
    ) {
        super(message, options);
    }
}
