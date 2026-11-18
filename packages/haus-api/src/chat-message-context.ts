import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

export const chatMessageAuthorSchema = z.discriminatedUnion('kind', [
    z
        .object({
            agentId: idSchema,
            kind: z.literal('agent'),
            profile: z
                .object({
                    avatarUrl: z.string().nullable(),
                    deleted: z.boolean(),
                    description: z.string().nullable(),
                    displayName: z.string().min(1),
                })
                .strict()
                .optional(),
        })
        .strict(),
    z
        .object({
            kind: z.literal('human'),
            profile: z
                .object({
                    avatarUrl: z.string().nullable(),
                    deleted: z.boolean(),
                    description: z.string().nullable(),
                    displayName: z.string().min(1),
                })
                .strict()
                .optional(),
            userId: idSchema,
        })
        .strict(),
]);

/**
 * A bounded quote used by an inline reply. Reply context deliberately carries
 * only identity, placement, author, timestamp, and a short excerpt; clients
 * can resolve the full message through the ordinary Chat history surface.
 */
export const chatMessageReplyReferenceSchema = z
    .object({
        author: chatMessageAuthorSchema,
        content: z.string().max(280),
        createdAt: timestampSchema,
        id: idSchema,
        sequence: z.number().int().positive(),
    })
    .strict();

export type ChatMessageReplyReference = z.infer<typeof chatMessageReplyReferenceSchema>;

export const chatMessageReplySchema = z
    .object({
        parent: chatMessageReplyReferenceSchema,
        parentMessageId: idSchema,
        root: chatMessageReplyReferenceSchema,
        rootMessageId: idSchema,
    })
    .strict();

export type ChatMessageReply = z.infer<typeof chatMessageReplySchema>;
