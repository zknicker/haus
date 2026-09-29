import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import { chatMessageAuthorSchema } from './chat-message-context.ts';

/**
 * Why a Needs you row is addressed to the viewer (ADR 0037). `dm` is a
 * message from someone else in a DM the viewer belongs to; `mention` is a
 * Channel message whose content carries a `user://<viewerId>` mention. A
 * mention inside a DM is already a `dm` row.
 */
export const needsYouReasons = ['dm', 'mention'] as const;

export type NeedsYouReason = (typeof needsYouReasons)[number];

export const needsYouPreviewMaxLength = 280;

export const inboxNeedsYouInputSchema = z.object({ serverId: idSchema }).strict();

/** The newest message addressing the viewer in the row's Chat. */
export const needsYouLatestSchema = z
    .object({
        author: chatMessageAuthorSchema,
        createdAt: timestampSchema,
        messageId: idSchema,
        /** Plain-text excerpt of the message content, cut to the preview budget. */
        preview: z.string().max(needsYouPreviewMaxLength),
        /** Chat sequence in `chatId`; `markDone` passes it as `throughSequence`. */
        sequence: z.number().int().positive(),
    })
    .strict();

const needsYouAnchoringShape = {
    /** Addressing messages since the viewer last answered here or marked Done. */
    addressedCount: z.number().int().positive(),
    /**
     * The Chat holding the addressing messages: the Thread's own Chat for a
     * Thread row, else the Channel or DM itself. It is the row identity and
     * the `markDone` target; one Chat has at most one row.
     */
    chatId: idSchema,
    /** The Channel or DM the conversation belongs to, never a Thread. */
    conversationChatId: idSchema,
    latest: needsYouLatestSchema,
    /** The Thread's anchor in `conversationChatId`; null for a top-level row. */
    threadAnchorMessageId: idSchema.nullable(),
};

/**
 * One exchange addressed to the viewer that the viewer has not answered or
 * marked Done. It clears when the viewer replies where the addresser will see
 * it, or marks it Done; newer addressing activity after Done brings it back.
 * A DM row is always `dm` and a Channel row always `mention`, so the reason
 * and the Chat kind never disagree.
 */
export const needsYouRowSchema = z
    .discriminatedUnion('reason', [
        z
            .object({
                ...needsYouAnchoringShape,
                chatKind: z.literal('dm'),
                chatPeerUserId: idSchema,
                reason: z.literal('dm'),
            })
            .strict(),
        z
            .object({
                ...needsYouAnchoringShape,
                chatKind: z.literal('channel'),
                chatName: z.string().trim().min(1),
                reason: z.literal('mention'),
            })
            .strict(),
    ])
    .refine(
        (row) => (row.threadAnchorMessageId === null) === (row.chatId === row.conversationChatId),
        {
            message: 'A Thread row names its anchor; a top-level row is its own conversation.',
            path: ['threadAnchorMessageId'],
        }
    );

/** Newest `latest.createdAt` first. */
export const needsYouListSchema = z.array(needsYouRowSchema);

/**
 * Done through `throughSequence` in `chatId`. Server rejects a sequence past
 * the Chat's last message, advances the viewer's read marker to it in the same
 * transaction, and emits the reader-scoped `chat.read` event.
 */
export const inboxMarkDoneInputSchema = z
    .object({
        chatId: idSchema,
        serverId: idSchema,
        throughSequence: z.number().int().positive(),
    })
    .strict();

export const inboxMarkDoneResultSchema = z
    .object({
        chatId: idSchema,
        doneSequence: z.number().int().positive(),
    })
    .strict();

export type NeedsYouLatest = z.infer<typeof needsYouLatestSchema>;
export type NeedsYouRow = z.infer<typeof needsYouRowSchema>;
export type InboxMarkDoneInput = z.infer<typeof inboxMarkDoneInputSchema>;
export type InboxMarkDoneResult = z.infer<typeof inboxMarkDoneResultSchema>;
