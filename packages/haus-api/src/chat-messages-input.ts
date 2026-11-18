import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

const chatMessagesInputBaseSchema = {
    chatId: idSchema,
    limit: z.number().int().min(1).max(100).default(50),
    replyRootMessageId: idSchema.optional(),
    serverId: idSchema,
};

const noChatMessagesSelector = z.never().optional();

/**
 * Message history has one active direction at a time. The selector variants
 * keep impossible cursor combinations out of both the wire contract and the
 * inferred TypeScript input type.
 */
export const chatMessagesInputSchema = z.union([
    z
        .object({
            ...chatMessagesInputBaseSchema,
            afterSequence: noChatMessagesSelector,
            aroundMessageId: noChatMessagesSelector,
            beforeSequence: z.number().int().positive(),
        })
        .strict(),
    z
        .object({
            ...chatMessagesInputBaseSchema,
            afterSequence: z.number().int().nonnegative(),
            aroundMessageId: noChatMessagesSelector,
            beforeSequence: noChatMessagesSelector,
        })
        .strict(),
    z
        .object({
            ...chatMessagesInputBaseSchema,
            afterSequence: noChatMessagesSelector,
            aroundMessageId: idSchema,
            beforeSequence: noChatMessagesSelector,
        })
        .strict(),
    z
        .object({
            ...chatMessagesInputBaseSchema,
            afterSequence: noChatMessagesSelector,
            aroundMessageId: noChatMessagesSelector,
            beforeSequence: noChatMessagesSelector,
        })
        .strict(),
]);

export type ChatMessagesInput = z.infer<typeof chatMessagesInputSchema>;
