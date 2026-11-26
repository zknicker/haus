import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import { chatMessageSchema } from './chat.ts';
import { taskShortIdSchema } from './task-short-id.ts';

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
    /** The short id of the Task whose chat holds the message; null in a Channel or DM. */
    taskShortId: taskShortIdSchema.nullable(),
});

export type ChatSearchResult = z.infer<typeof chatSearchResultSchema>;

export const chatSearchResultsSchema = z.array(chatSearchResultSchema);
