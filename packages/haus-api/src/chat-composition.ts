import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

export const compositionPublishInputSchema = z
    .object({
        chatId: idSchema,
        compositionId: idSchema,
        serverId: idSchema,
        text: z.string().max(2000).nullable(),
    })
    .strict();

export const compositionSubscriptionInputSchema = z
    .object({ chatId: idSchema, serverId: idSchema })
    .strict();

export const compositionEventSchema = z
    .object({
        actorUserId: idSchema,
        chatId: idSchema,
        compositionId: idSchema,
        emittedAt: timestampSchema,
        serverId: idSchema,
        text: z.string().max(2000).nullable(),
    })
    .strict();

export type CompositionEvent = z.infer<typeof compositionEventSchema>;

export const compositionPublishedSchema = z.object({ accepted: z.literal(true) }).strict();
