import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';

/**
 * Chat realtime events (specs/realtime-events.md). Each has its own
 * subscription taking `serverStreamInputSchema`. Events carry ids and small
 * facts, never rows: the App answers each one with a read: a tail read
 * (`chat.messages` after its cached tail) or invalidating `chat.message` entries, so the read
 * is the truth and a duplicate, late, or reordered event converges.
 */

/**
 * `chat.onMessageCreated`: a message committed. `sequence` lets the App skip
 * a tail read its cache already covers. The author, kind, and reply author are
 * the facts `messageNotificationReason` reads.
 */
export const messageCreatedEventSchema = z
    .object({
        authorUserId: idSchema.nullable(),
        chatId: idSchema,
        conversationKind: z.enum(['channel', 'dm']),
        mentionedUserIds: z.array(idSchema),
        messageId: idSchema,
        replyToAuthorUserId: idSchema.nullable(),
        sequence: z.number().int().positive(),
        serverId: idSchema,
        taskId: idSchema.nullable(),
    })
    .strict();

export type MessageCreatedEvent = z.infer<typeof messageCreatedEventSchema>;

/** `chat.onMessageReactionUpdated`: one message's reaction set changed. */
export const messageReactionUpdatedEventSchema = z
    .object({
        chatId: idSchema,
        messageId: idSchema,
        serverId: idSchema,
    })
    .strict();

export type MessageReactionUpdatedEvent = z.infer<typeof messageReactionUpdatedEventSchema>;

/** `chat.onRead`: the subscriber's own read marker moved. Delivered to the reader only. */
export const chatReadEventSchema = z
    .object({
        chatId: idSchema,
        sequence: z.number().int().nonnegative(),
        serverId: idSchema,
        taskId: idSchema.nullable(),
    })
    .strict();

export type ChatReadEvent = z.infer<typeof chatReadEventSchema>;

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
