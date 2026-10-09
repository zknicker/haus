import * as z from 'zod';
import { chatMessageSchema, idSchema, threadSummarySchema } from './chat.ts';

/**
 * `chat.message`: one message entity (specs/realtime-events.md, "Normalized
 * transcript cache"). The App keeps each message in its own query entry under
 * this read, seeds it from every list read, and invalidates it when a realtime
 * event says the message changed. Same authorization as `chat.messages` for
 * `chatId`.
 */
export const chatMessageInputSchema = z
    .object({
        chatId: idSchema,
        messageId: idSchema,
        serverId: idSchema,
    })
    .strict();

export type ChatMessageInput = z.infer<typeof chatMessageInputSchema>;

/**
 * The message exactly as `chat.messages` projects it, with the viewer's Thread
 * summary when the message anchors one (the same per-viewer `followed` and
 * `unreadCount`). Null when the id no longer resolves in `chatId`.
 */
export const chatMessageEntitySchema = z
    .object({
        message: chatMessageSchema,
        thread: threadSummarySchema.nullable(),
    })
    .strict();

export type ChatMessageEntity = z.infer<typeof chatMessageEntitySchema>;

export const chatMessageReadSchema = chatMessageEntitySchema.nullable();
