import * as z from 'zod';
import { chatMessageSchema, threadSummarySchema } from './chat.ts';
import { idSchema } from './chat-contract-primitives.ts';
import { chatMessageReactionSchema } from './chat-message-reactions.ts';

/**
 * Chat and Thread realtime events (specs/realtime-events.md). Each has its own
 * subscription taking `serverStreamInputSchema`. The Server authorizes every
 * delivery against the subscriber's Chat access, so an event may carry the
 * authorized row and the App patches its cache instead of refetching every
 * loaded transcript page.
 */

/**
 * A Thread's summary as every member sees it: the viewer-relative `followed`
 * and `unreadCount` stay with the App's cached summary.
 */
export const threadActivitySchema = threadSummarySchema.omit({ followed: true, unreadCount: true });

export type ThreadActivity = z.infer<typeof threadActivitySchema>;

/**
 * `chat.onMessageCreated`: the committed message row, nonce included so the
 * App retires its optimistic pending row, plus the addressing facts
 * `messageNotificationReason` reads. A Thread reply also carries the parent's
 * Thread activity after it.
 */
export const messageCreatedEventSchema = z
    .object({
        authorUserId: idSchema.nullable(),
        chatId: idSchema,
        conversationKind: z.enum(['channel', 'dm']), // A Thread reports its parent's kind.
        mentionedUserIds: z.array(idSchema),
        message: chatMessageSchema,
        parentChatId: idSchema.nullable(),
        replyToAuthorUserId: idSchema.nullable(),
        serverId: idSchema,
        thread: threadActivitySchema.nullable(),
        threadAnchorAuthorUserId: idSchema.nullable(),
    })
    .strict();

export type MessageCreatedEvent = z.infer<typeof messageCreatedEventSchema>;

/** `chat.onMessageReactionUpdated`: the message's whole reaction set after the change. */
export const messageReactionUpdatedEventSchema = z
    .object({
        chatId: idSchema,
        messageId: idSchema,
        parentChatId: idSchema.nullable(),
        reactions: z.array(chatMessageReactionSchema),
        serverId: idSchema,
    })
    .strict();

export type MessageReactionUpdatedEvent = z.infer<typeof messageReactionUpdatedEventSchema>;

/** `chat.onRead`: the subscriber's own read marker moved. Delivered to the reader only. */
export const chatReadEventSchema = z
    .object({
        chatId: idSchema,
        parentChatId: idSchema.nullable(),
        sequence: z.number().int().nonnegative(),
        serverId: idSchema,
    })
    .strict();

export type ChatReadEvent = z.infer<typeof chatReadEventSchema>;

/** `thread.onFollowUpdated`: the subscriber followed or unfollowed a Thread. Reader only. */
export const threadFollowUpdatedEventSchema = z
    .object({
        followed: z.boolean(),
        parentChatId: idSchema,
        serverId: idSchema,
        threadChatId: idSchema,
    })
    .strict();

export type ThreadFollowUpdatedEvent = z.infer<typeof threadFollowUpdatedEventSchema>;

/**
 * `chat.onLifecycle`: one Chat's existence changed. `created` for a new
 * Channel or a DM's first resolution, `updated` for a rename, appearance, or
 * Agent participant change, plus the archive lifecycle. Chat-access scoped,
 * except `deleted`, which reaches every Server member: the Chat is already
 * gone from access, and the event carries only ids.
 */
export const chatLifecycleEventSchema = z
    .object({
        action: z.enum(['archived', 'created', 'deleted', 'unarchived', 'updated']),
        chatId: idSchema,
        serverId: idSchema,
    })
    .strict();

export type ChatLifecycleEvent = z.infer<typeof chatLifecycleEventSchema>;
