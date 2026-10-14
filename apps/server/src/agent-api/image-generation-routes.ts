import {
    agentImageGenerationCreateInputSchema,
    agentImageGenerationGetInputSchema,
} from '@haus/api';
import type { FastifyInstance } from 'fastify';
import {
    ImageGenerationNoKeyError,
    ImageGenerationNonceConflictError,
    ImageGenerationNotFoundError,
    ImageGenerationReferenceError,
    ImageGenerationRequestError,
} from '../image-generation/image-generation-errors.ts';
import type { ImageGenerationService } from '../image-generation/image-generation-service.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { authorizeAgentRunner, sendAgentApiError } from './auth.ts';

/**
 * The Agent-scoped image generation routes. The Computer CLI calls these behind
 * its loopback proxy: `models`, `create` (returns the record and its Link at
 * once), and a poll until the generation is `ready` or `failed`. Ready bytes
 * come through the existing `GET /api/agent/attachments/:id`.
 */
export function registerAgentImageGenerationRoutes(
    app: FastifyInstance,
    dependencies: { db: HausDatabase; imageGeneration: ImageGenerationService }
) {
    const unauthorized = (reply: Parameters<typeof sendAgentApiError>[0]) =>
        sendAgentApiError(reply, 401, 'MISSING_TOKEN', 'A valid runner credential is required.');

    app.get('/api/agent/image-generation/models', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return unauthorized(reply);
        }
        return await dependencies.imageGeneration.models(runner);
    });

    app.post('/api/agent/image-generation', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return unauthorized(reply);
        }
        const parsed = agentImageGenerationCreateInputSchema.safeParse(request.body);
        if (!parsed.success) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                parsed.error.issues[0]?.message ?? 'The image generation request was invalid.'
            );
        }
        try {
            return await dependencies.imageGeneration.create(runner, parsed.data);
        } catch (cause) {
            return sendImageGenerationFailure(reply, cause);
        }
    });

    app.get('/api/agent/image-generation', async (request, reply) => {
        const runner = await authorizeAgentRunner(dependencies.db, request);
        if (!runner) {
            return unauthorized(reply);
        }
        const parsed = agentImageGenerationGetInputSchema.safeParse(request.query);
        if (!parsed.success) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', 'The generation id was invalid.');
        }
        try {
            return {
                generation: await dependencies.imageGeneration.get(
                    runner,
                    parsed.data.generationId
                ),
            };
        } catch (cause) {
            return sendImageGenerationFailure(reply, cause);
        }
    });
}

function sendImageGenerationFailure(
    reply: Parameters<typeof sendAgentApiError>[0],
    cause: unknown
): unknown {
    if (cause instanceof ImageGenerationRequestError) {
        return sendAgentApiError(reply, 400, 'IMAGE_GENERATION_INVALID', cause.message);
    }
    if (cause instanceof ImageGenerationReferenceError) {
        return sendAgentApiError(reply, 400, 'IMAGE_GENERATION_REFERENCE', cause.message);
    }
    if (cause instanceof ImageGenerationNoKeyError) {
        return sendAgentApiError(reply, 409, 'IMAGE_GENERATION_NO_KEY', cause.message, {
            nextAction: 'Ask the Server Owner to add the key in Settings → Image generation.',
        });
    }
    if (cause instanceof ImageGenerationNonceConflictError) {
        return sendAgentApiError(
            reply,
            409,
            'IMAGE_GENERATION_IDEMPOTENCY_CONFLICT',
            cause.message
        );
    }
    if (cause instanceof ImageGenerationNotFoundError) {
        return sendAgentApiError(reply, 404, 'IMAGE_GENERATION_NOT_FOUND', cause.message);
    }
    return sendAgentApiError(
        reply,
        500,
        'SERVER_5XX',
        'The Server could not complete the image generation request.'
    );
}
