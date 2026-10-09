import * as z from 'zod';

export const agentInboxViews = ['unread', 'mentions'] as const;

export const agentInboxViewSchema = z.enum(agentInboxViews);

export type AgentInboxView = z.infer<typeof agentInboxViewSchema>;

/**
 * One conversation an Agent belongs to with unread past its read position
 * (`haus inbox check`). Channels, DMs, and followed Threads are separate rows.
 * `activityKey` is an opaque key built from the conversation's newest message
 * (its `created_at`, then id): unique per row, ordered newest first by the
 * Server, and the keyset `before` pages by. Clients never parse or compare it.
 */
export const agentInboxActivityKeySchema = z.string().min(1).max(200);

export const agentInboxConversationSchema = z
    .object({
        activityKey: agentInboxActivityKeySchema,
        chatId: z.string().min(1),
        kind: z.enum(['channel', 'dm', 'thread']),
        lastReadSequence: z.number().int().nonnegative(),
        latestAt: z.iso.datetime({ offset: true }).nullable(),
        latestSenderHandle: z.string().min(1).nullable(),
        mentions: z.number().int().nonnegative(),
        target: z.string().min(1),
        unread: z.number().int().nonnegative(),
    })
    .strict();

export type AgentInboxConversation = z.infer<typeof agentInboxConversationSchema>;

/** `GET /api/agent/inbox/conversations`: newest activity first, one consistent snapshot. */
export const agentInboxConversationsResponseSchema = z
    .object({
        hasMore: z.boolean(),
        items: z.array(agentInboxConversationSchema),
        nextBefore: agentInboxActivityKeySchema.nullable(),
        /** Over every unread conversation, whatever the view. */
        totals: z
            .object({
                conversations: z.number().int().nonnegative(),
                dms: z.number().int().nonnegative(),
                mentions: z.number().int().nonnegative(),
            })
            .strict(),
        view: agentInboxViewSchema,
    })
    .strict();

export type AgentInboxConversationsResponse = z.infer<typeof agentInboxConversationsResponseSchema>;
