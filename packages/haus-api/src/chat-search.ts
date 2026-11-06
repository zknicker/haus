import * as z from 'zod';
import { chatMessageSchema } from './chat.ts';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

export const chatSearchInputSchema = z
    .object({
        /** Only messages created at or after this instant. */
        after: timestampSchema.optional(),
        authorAgentId: idSchema.optional(),
        authorUserId: idSchema.optional(),
        chatId: idSchema.optional(),
        limit: z.number().int().min(1).max(100).default(50),
        query: z.string().trim().min(1).max(500),
        serverId: idSchema,
    })
    .strict();

export const chatSearchResultSchema = chatMessageSchema.extend({
    /** When the Message's Channel or DM was archived; a Thread reads its parent's. */
    chatArchivedAt: timestampSchema.nullable(),
    /** Where a Thread Message sits; null for a Message in a Channel or DM. */
    thread: z
        .object({
            anchorMessageId: idSchema,
            parentChatId: idSchema,
        })
        .strict()
        .nullable(),
});

export type ChatSearchResult = z.infer<typeof chatSearchResultSchema>;

export const chatSearchResultsSchema = z.array(chatSearchResultSchema);
