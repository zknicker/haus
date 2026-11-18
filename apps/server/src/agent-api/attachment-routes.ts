import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import type { AttachmentRoot } from '../attachments/attachment-root.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { AgentAttachmentError, uploadAgentAttachment, viewAgentAttachment } from './attachments.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

const attachmentIdSchema = z.string().regex(/^att_[A-Za-z0-9_-]{16}$/u);

export function registerAgentAttachmentRoutes(
    app: FastifyInstance,
    options: { db: HausDatabase; root: AttachmentRoot }
) {
    app.post(
        '/api/agent/attachments/upload',
        { bodyLimit: 70 * 1024 * 1024 },
        async (request, reply) => {
            const runner = await authorizeAgentRunner(options.db, request);
            const parsed = z
                .object({
                    dataBase64: z.string(),
                    filename: z.string().min(1).max(255),
                    mediaType: z.string().min(1).max(255).optional(),
                })
                .strict()
                .safeParse(request.body);
            if (!(runner && parsed.success)) {
                return sendAgentApiError(
                    reply,
                    400,
                    'INVALID_ARG',
                    'The attachment upload request was invalid.'
                );
            }
            try {
                return await uploadAgentAttachment(options.db, options.root, runner, parsed.data);
            } catch (cause) {
                return sendAttachmentError(reply, cause);
            }
        }
    );

    app.get('/api/agent/attachments/:id', async (request, reply) => {
        const runner = await authorizeAgentRunner(options.db, request);
        const parsed = z.object({ id: attachmentIdSchema }).safeParse(request.params);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'The attachment request was invalid.'
            );
        }
        try {
            return await viewAgentAttachment(options.db, options.root, runner, parsed.data.id);
        } catch (cause) {
            return sendAttachmentError(reply, cause);
        }
    });
}

function sendAttachmentError(reply: Parameters<typeof sendAgentApiError>[0], cause: unknown) {
    if (cause instanceof AgentAttachmentError) {
        const status =
            cause.code === 'TARGET_NOT_FOUND' ? 404 : cause.code === 'INVALID_ARG' ? 400 : 403;
        return sendAgentApiError(reply, status, cause.code, cause.message);
    }
    return sendAgentApiError(
        reply,
        500,
        'SERVER_5XX',
        'The Server could not complete the attachment request.'
    );
}
