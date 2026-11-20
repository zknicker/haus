import { chatMessageReplyReferenceSchema, chatMessageReplySchema, idSchema } from '@haus/api';
import * as z from 'zod';

/**
 * Parses the same shape as `@haus/api`'s `.strict()` inline-reply schemas,
 * loosened at every nested object so an older Computer tolerates a field a
 * newer Server added instead of rejecting the whole message or inbox item
 * that carries a reply. Those canonical schemas stay strict for the
 * Server's own construction; only response parsing needs this tolerance.
 */

const chatMessageAuthorProfileResponseSchema = z.looseObject({
    avatarUrl: z.string().nullable(),
    deleted: z.boolean(),
    description: z.string().nullable(),
    displayName: z.string().min(1),
});

const chatMessageAuthorResponseSchema = z.discriminatedUnion('kind', [
    z.looseObject({
        agentId: idSchema,
        kind: z.literal('agent'),
        profile: chatMessageAuthorProfileResponseSchema.optional(),
    }),
    z.looseObject({
        kind: z.literal('human'),
        profile: chatMessageAuthorProfileResponseSchema.optional(),
        userId: idSchema,
    }),
]);

const chatMessageReplyReferenceResponseSchema = z.looseObject({
    ...chatMessageReplyReferenceSchema.shape,
    author: chatMessageAuthorResponseSchema,
});

export const chatMessageReplyResponseSchema = z.looseObject({
    ...chatMessageReplySchema.shape,
    parent: chatMessageReplyReferenceResponseSchema,
    root: chatMessageReplyReferenceResponseSchema,
});
