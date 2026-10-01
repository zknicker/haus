import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * Moves the caller's read marker in one Chat forward to `sequence`, clamped
 * to its newest message. Viewing a Chat while Haus is in view sends it; the
 * Inbox's Mark read sends `includeThreads` too, which also reads every Thread
 * under the Chat through its newest message, so the Thread replies a Channel
 * or DM's unread count rolls up clear with it.
 */
export const chatMarkReadInputSchema = z
    .object({
        chatId: idSchema,
        includeThreads: z.boolean().optional(),
        sequence: z.number().int().nonnegative(),
        serverId: idSchema,
    })
    .strict();

export const chatReadReceiptSchema = z
    .object({
        chatId: idSchema,
        eventCursor: z
            .string()
            .regex(/^[1-9]\d*$/u)
            .nullable(),
        sequence: z.number().int().nonnegative(),
        serverId: idSchema,
    })
    .strict();

export type ChatMarkReadInput = z.infer<typeof chatMarkReadInputSchema>;
export type ChatReadReceipt = z.infer<typeof chatReadReceiptSchema>;

/**
 * How many of the caller's Channels and DMs, across every Server they belong
 * to, have anything unread: `chat.list` rows with `unreadCount > 0`, summed.
 * The app icon badge, and the same number iPhone push sets as `aps.badge`.
 */
export const unreadChatCountSchema = z.object({ count: z.number().int().nonnegative() }).strict();

export type UnreadChatCount = z.infer<typeof unreadChatCountSchema>;
