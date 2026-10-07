import * as z from 'zod';

/**
 * `GET /api/agent/inbox`: the pending (not yet delivered) queue snapshot, one
 * row per chat. `haus inbox check` uses it to annotate the durable unread list.
 */
export const agentInboxCheckResponseSchema = z.object({
    rows: z.array(
        z.object({
            // An older Server omits the work facts; its rows print untagged.
            chatId: z.string().min(1),
            cloudAgentResult: z.boolean().default(false),
            // An older Server omits it; the pending row's open command then has no --after.
            firstSequence: z.number().int().positive().nullable().optional(),
            firstShortId: z.string().min(1),
            latestSender: z.string().min(1),
            latestShortId: z.string().min(1),
            mentioned: z.boolean(),
            pendingCount: z.number().int().positive(),
            target: z.string().min(1),
            taskNumber: z.number().int().positive().nullable().default(null),
        })
    ),
    totalPending: z.number().int().nonnegative(),
});

export const agentInboxViews = ['unread', 'mentions'] as const;
export type AgentInboxView = (typeof agentInboxViews)[number];

/** `GET /api/agent/inbox/conversations`: the durable unread list, newest activity first. */
export const agentInboxConversationsResponseSchema = z.object({
    hasMore: z.boolean(),
    items: z.array(
        z.object({
            chatId: z.string().min(1),
            kind: z.enum(['channel', 'dm', 'thread']),
            lastReadSequence: z.number().int().nonnegative(),
            latestAt: z.string().nullable(),
            latestSenderHandle: z.string().nullable(),
            mentions: z.number().int().nonnegative(),
            target: z.string().min(1),
            unread: z.number().int().nonnegative(),
        })
    ),
    nextBefore: z.number().int().positive().nullable(),
    totals: z.object({
        conversations: z.number().int().nonnegative(),
        dms: z.number().int().nonnegative(),
        mentions: z.number().int().nonnegative(),
    }),
    view: z.enum(agentInboxViews),
});

export type AgentInboxPendingRow = z.infer<typeof agentInboxCheckResponseSchema>['rows'][number];
export type AgentInboxConversations = z.infer<typeof agentInboxConversationsResponseSchema>;
