import { z } from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

/**
 * A Chat is engaged by an Agent while that Agent's active run has read a human
 * message there and has not yet answered it (ADR 0034). The App presents it as
 * typing. Engagement is volatile: it is derived from durable delivery state,
 * announced live, and recovered through `chat.engagements`, never replayed.
 */
export const chatEngagementSchema = z
    .object({
        agentId: idSchema,
        chatId: idSchema,
        runId: idSchema,
        startedAt: timestampSchema,
    })
    .strict();
export type ChatEngagement = z.infer<typeof chatEngagementSchema>;

export const chatEngagementEndReasonSchema = z.enum(['sent', 'settled', 'interrupted']);
export type ChatEngagementEndReason = z.infer<typeof chatEngagementEndReasonSchema>;

const engagementEventBaseSchema = z.object({
    agentId: idSchema,
    chatId: idSchema,
    emittedAt: timestampSchema,
    runId: idSchema,
    serverId: idSchema,
});

export const chatEngagementEventSchema = z.discriminatedUnion('type', [
    engagementEventBaseSchema.extend({ type: z.literal('chat.engagement.started') }).strict(),
    engagementEventBaseSchema
        .extend({
            reason: chatEngagementEndReasonSchema,
            type: z.literal('chat.engagement.ended'),
        })
        .strict(),
]);
export type ChatEngagementEvent = z.infer<typeof chatEngagementEventSchema>;

export const chatEngagementsInputSchema = z
    .object({ chatId: idSchema, serverId: idSchema })
    .strict();

export const chatEngagementsSchema = z
    .object({ engagements: z.array(chatEngagementSchema) })
    .strict();
export type ChatEngagements = z.infer<typeof chatEngagementsSchema>;

export const chatEngagementSubscriptionInputSchema = chatEngagementsInputSchema;
