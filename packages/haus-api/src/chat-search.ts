import * as z from 'zod';

import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import { chatMessageSchema } from './chat.ts';

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
    chatArchivedAt: timestampSchema.nullable(),
});

export type ChatSearchResult = z.infer<typeof chatSearchResultSchema>;

export const chatSearchResultsSchema = z.array(chatSearchResultSchema);
