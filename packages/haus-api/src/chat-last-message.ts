import * as z from 'zod';
import { timestampSchema } from './chat-contract-primitives.ts';

/**
 * The newest top-level message of a Chat, as the line a list row quotes
 * beneath the Chat's name. Content stays raw Markdown; collapsing it to one
 * plain line is the reader's job (`messagePreviewLine`). Null until the Chat
 * holds a message, or when its author no longer resolves to a name.
 */
export const chatLastMessageSchema = z
    .object({
        authorDisplayName: z.string().min(1),
        content: z.string(),
        createdAt: timestampSchema,
    })
    .strict();

export type ChatLastMessage = z.infer<typeof chatLastMessageSchema>;
