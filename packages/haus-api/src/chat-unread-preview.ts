import * as z from 'zod';
import { chatMessageSchema } from './chat.ts';
import { idSchema } from './chat-contract-primitives.ts';

/** How many waiting messages an Inbox row carries before "N earlier". */
export const unreadPreviewMessageLimit = 3;

/**
 * `chat.unreadPreviews`: the waiting messages behind every unread Inbox row on
 * one Server, in one read. The row set is exactly `chat.list`'s unread Chats
 * plus `thread.listUnread`'s Threads; this read only adds what each row says.
 */
export const chatUnreadPreviewsInputSchema = z
    .object({
        serverId: idSchema,
    })
    .strict();

/**
 * One unread Chat or Thread's newest counted messages, oldest first: the same
 * messages its `unreadCount` counts (someone else's, past the read marker;
 * for a Thread, followed or mentioning the reader). `chatId` is the Channel,
 * DM, or Thread's own Chat id, which keys it to its Inbox row.
 */
export const chatUnreadPreviewSchema = z
    .object({
        /** A Thread's anchor, which its row names ("on Beacon: …"); null for a Channel or DM. */
        anchor: chatMessageSchema.nullable(),
        chatId: idSchema,
        /** Counted messages older than `messages`, which "N earlier" opens. */
        earlierUnreadCount: z.number().int().nonnegative(),
        messages: z.array(chatMessageSchema).min(1).max(unreadPreviewMessageLimit),
    })
    .strict();

export const chatUnreadPreviewListSchema = z
    .object({
        previews: z.array(chatUnreadPreviewSchema),
    })
    .strict();

export type ChatUnreadPreviewsInput = z.infer<typeof chatUnreadPreviewsInputSchema>;
export type ChatUnreadPreview = z.infer<typeof chatUnreadPreviewSchema>;
export type ChatUnreadPreviewList = z.infer<typeof chatUnreadPreviewListSchema>;
