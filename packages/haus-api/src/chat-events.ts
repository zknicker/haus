import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * Chat and Thread realtime events (specs/realtime-events.md). Each has its own
 * subscription taking `serverStreamInputSchema`. Events carry ids and small
 * facts, never rows: the App answers each one with a read: a tail read
 * (`chat.messages` after its cached tail) or invalidating `chat.message` entries, so the read
 * is the truth and a duplicate, late, or reordered event converges.
 */

/**
 * `chat.onMessageCreated`: a message committed. `sequence` lets the App skip
 * a tail read its cache already covers. A Thread reply names the parent's
 * anchor so the App invalidates the anchor entry (its Thread summary). The author, kind, and
 * reply/anchor authors are the facts `messageNotificationReason` reads.
 */
export const messageCreatedEventSchema = z
    .object({
        authorUserId: idSchema.nullable(),
        chatId: idSchema,
        conversationKind: z.enum(['channel', 'dm']), // A Thread reports its parent's kind.
        mentionedUserIds: z.array(idSchema),
        messageId: idSchema,
        parentChatId: idSchema.nullable(),
        replyToAuthorUserId: idSchema.nullable(),
        sequence: z.number().int().positive(),
        serverId: idSchema,
        threadAnchorAuthorUserId: idSchema.nullable(),
        /** The parent-Chat anchor of a Thread reply; null outside a Thread. */
        threadAnchorMessageId: idSchema.nullable(),
    })
    .strict()
    .refine((event) => (event.parentChatId === null) === (event.threadAnchorMessageId === null), {
        message:
            'A Thread reply names both its parent Chat and its anchor; other messages neither.',
    });

export type MessageCreatedEvent = z.infer<typeof messageCreatedEventSchema>;

/** `chat.onMessageReactionUpdated`: one message's reaction set changed. */
export const messageReactionUpdatedEventSchema = z
    .object({
        chatId: idSchema,
        messageId: idSchema,
        parentChatId: idSchema.nullable(),
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

/**
 * `thread.onFollowUpdated`: the subscriber followed or unfollowed a Thread.
 * Reader only. Names the anchor so the App invalidates that one entry.
 */
export const threadFollowUpdatedEventSchema = z
    .object({
        anchorMessageId: idSchema,
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
