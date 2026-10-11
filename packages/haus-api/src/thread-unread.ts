import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import { chatLastMessageSchema } from './chat-last-message.ts';

/**
 * `thread.listUnread`: the caller's unread Threads on one Server, the Inbox's
 * Thread rows. A Thread is unread on its own, never through its parent Chat
 * (ADR 0043).
 */
export const threadUnreadListInputSchema = z
    .object({
        serverId: idSchema,
    })
    .strict();

/**
 * One Thread with replies the caller has not read and is attending to: a reply
 * from someone else past the caller's Thread read marker that sits in a Thread
 * the caller follows, or that @mentions the caller. Its parent is a Channel or
 * DM `chat.list` lists (visible, undeleted, unarchived), so the parent row is
 * always there to name it. Mark read is `chat.markRead` on `threadChatId`.
 */
export const unreadThreadSchema = z
    .object({
        anchorMessageId: idSchema,
        /** The oldest counted reply, where opening the Thread should land. */
        firstUnreadMessageId: idSchema,
        firstUnreadSequence: z.number().int().positive(),
        /** The Thread's last write, as `Chat.lastActivityAt` is for a Channel or DM. */
        lastActivityAt: timestampSchema.nullable(),
        /**
         * The newest counted reply (the `unreadCount` rule: someone else's, past the read
         * marker, followed or mentioning the viewer); null when its author no longer resolves.
         */
        latestReply: chatLastMessageSchema.nullable(),
        /** The Thread's newest sequence, the `chat.markRead` target that clears the row. */
        lastMessageSequence: z.number().int().nonnegative(),
        parentChatId: idSchema,
        serverId: idSchema,
        threadChatId: idSchema,
        unreadCount: z.number().int().positive(),
    })
    .strict();

/** Newest activity first, like `chat.list`. */
export const unreadThreadListSchema = z
    .object({
        threads: z.array(unreadThreadSchema),
    })
    .strict();

export type ThreadUnreadListInput = z.infer<typeof threadUnreadListInputSchema>;
export type UnreadThread = z.infer<typeof unreadThreadSchema>;
export type UnreadThreadList = z.infer<typeof unreadThreadListSchema>;
