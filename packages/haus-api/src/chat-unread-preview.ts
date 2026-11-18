import * as z from 'zod';
import { chatMessageSchema } from './chat.ts';
import { idSchema } from './chat-contract-primitives.ts';
import { taskKeySchema } from './task-key.ts';
import { taskStateSchema } from './task-state.ts';

/** How many waiting messages an Inbox row carries before "N earlier". */
export const unreadPreviewMessageLimit = 3;

/**
 * `chat.unreadPreviews`: the waiting messages behind every unread Inbox row on
 * one Server, in one read. The row set is exactly `chat.list`'s unread Chats
 * plus the caller's unread followed Tasks; this read only adds what each row says.
 */
export const chatUnreadPreviewsInputSchema = z
    .object({
        serverId: idSchema,
    })
    .strict();

/** What an unread Task row names beyond its messages. */
export const chatUnreadPreviewTaskSchema = z
    .object({
        key: taskKeySchema,
        originChatId: idSchema,
        state: taskStateSchema,
        taskId: idSchema,
        title: z.string().min(1),
    })
    .strict();

/**
 * One unread Chat's newest counted messages, oldest first: the same messages
 * its `unreadCount` counts (someone else's, past the read marker; for a Task,
 * followed or mentioning the reader). `chatId` is the Channel, DM, or Task's
 * own Chat id, which keys it to its Inbox row.
 */
export const chatUnreadPreviewSchema = z
    .object({
        chatId: idSchema,
        /** Counted messages older than `messages`, which "N earlier" opens. */
        earlierUnreadCount: z.number().int().nonnegative(),
        messages: z.array(chatMessageSchema).min(1).max(unreadPreviewMessageLimit),
        /**
         * Set on a followed Task's row (ADR 0053 decision 9): `chatId` is then the
         * Task's own Chat, and the row names the Task by key and title. Null for a
         * Channel or DM row.
         */
        task: chatUnreadPreviewTaskSchema.nullable().default(null),
    })
    .strict();

export const chatUnreadPreviewListSchema = z
    .object({
        previews: z.array(chatUnreadPreviewSchema),
    })
    .strict();

export type ChatUnreadPreviewsInput = z.infer<typeof chatUnreadPreviewsInputSchema>;
export type ChatUnreadPreview = z.infer<typeof chatUnreadPreviewSchema>;
export type ChatUnreadPreviewTask = z.infer<typeof chatUnreadPreviewTaskSchema>;
export type ChatUnreadPreviewList = z.infer<typeof chatUnreadPreviewListSchema>;
