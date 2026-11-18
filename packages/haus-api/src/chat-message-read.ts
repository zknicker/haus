import * as z from 'zod';
import { chatMessageSchema, idSchema } from './chat.ts';
import { taskPreviewSchema } from './task-preview.ts';

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
 * The message exactly as `chat.messages` projects it, with the previews of the
 * Tasks started from it, as a `chat.messages` page carries them (ADR 0053
 * decision 7). Null when the id no longer resolves in `chatId`.
 */
export const chatMessageEntitySchema = z
    .object({
        message: chatMessageSchema,
        tasks: z.array(taskPreviewSchema).default([]),
    })
    .strict();

export type ChatMessageEntity = z.infer<typeof chatMessageEntitySchema>;

export const chatMessageReadSchema = chatMessageEntitySchema.nullable();
