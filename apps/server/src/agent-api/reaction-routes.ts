import { normalizeReactionEmoji, reactionEmojiRule } from '@haus/api';
import type { FastifyInstance } from 'fastify';
import * as z from 'zod';
import { emitDurableChatEvent } from '../chats/durable-events.ts';
import type { HausDatabase } from '../postgres/connection.ts';
import { authorizeAgentRunner, sendAgentApiError, sendAgentReadError } from './auth.ts';
import { changeAgentReaction } from './reactions.ts';

export function registerAgentReactionRoutes(app: FastifyInstance, db: HausDatabase) {
    app.post('/api/agent/messages/react', async (request, reply) => {
        const runner = await authorizeAgentRunner(db, request);
        const parsed = z
            .object({
                emoji: z.string().trim().min(1).max(64),
                messageId: z.string().trim().min(1).max(200),
                remove: z.boolean().default(false),
            })
            .strict()
            .safeParse(request.body);
        if (!(runner && parsed.success)) {
            return sendAgentApiError(
                reply,
                400,
                'INVALID_ARG',
                'The reaction request was invalid.'
            );
        }
        const emoji = agentReactionEmojiFor(parsed.data);
        if (!emoji) {
            return sendAgentApiError(reply, 400, 'INVALID_ARG', reactionEmojiRule);
        }
        try {
            const result = await changeAgentReaction(db, runner, { ...parsed.data, emoji });
            if (result.event) {
                emitDurableChatEvent({ audienceUserId: null, event: result.event });
            }
            return { message: result.message };
        } catch (cause) {
            return sendAgentReadError(reply, cause);
        }
    });
}

/** Adds must be one emoji; a remove may clear anything so older reactions stay removable. */
function agentReactionEmojiFor(input: { emoji: string; remove: boolean }): string | null {
    return normalizeReactionEmoji(input.emoji) ?? (input.remove ? input.emoji : null);
}
