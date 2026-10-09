import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

export const chatMessageReactionActorSchema = z
    .object({
        handle: z.string().nullable(),
        id: idSchema,
        kind: z.enum(['agent', 'human']),
    })
    .strict();

export const chatMessageReactionSchema = z
    .object({
        actors: z.array(chatMessageReactionActorSchema).min(1),
        emoji: z.string().min(1).max(64),
    })
    .strict();

export type ChatMessageReaction = z.infer<typeof chatMessageReactionSchema>;

export const chatMessageReactionInputSchema = z
    .object({
        emoji: z.string().trim().min(1).max(64),
        messageId: idSchema,
        remove: z.boolean().default(false),
        serverId: idSchema,
    })
    .strict();

export type ChatMessageReactionInput = z.infer<typeof chatMessageReactionInputSchema>;
