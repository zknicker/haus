import * as z from 'zod';
import { chatMessageReplySchema, idSchema } from './chat.ts';
import { messageClaimSchema } from './claim-shared.ts';
import { driveConflictFileSchema } from './drive.ts';
import { humanTimezoneSchema } from './membership.ts';
const timestampSchema = z.iso.datetime({ offset: true });

/** What a pull request did, on a `pull_request` notice (ADR 0053). */
export const pullRequestChangeSchema = z
    .object({
        change: z.enum(['ready_for_review', 'checks_passing', 'checks_failing']),
        url: z.url().max(2000),
    })
    .strict();

export type PullRequestChange = z.infer<typeof pullRequestChangeSchema>;

/**
 * Why an item is addressed to this Agent personally rather than ambiently: its own Captain
 * chat, its own Task chat, an @mention, a committed Jev routing, or `sole` — the Agent is the
 * only eligible one in a channel whose only human member sent the message.
 */
export const addressedReasonSchema = z.enum([
    'captain_chat',
    'task_chat',
    'mention',
    'routing',
    'sole',
]);

export type AddressedReason = z.infer<typeof addressedReasonSchema>;

/** One chat holding queued work no row of the current frame represents. */
export const unreadElsewhereSchema = z
    .object({
        count: z.number().int().positive(),
        target: z.string().trim().min(1).max(200),
    })
    .strict();

export type UnreadElsewhere = z.infer<typeof unreadElsewhereSchema>;

/** One message quoted in a Task context package, with the identity to attest it by. */
export const agentTaskContextMessageSchema = z
    .object({
        chatId: idSchema,
        /** The content was cut to the package budget, so it is not attested as seen. */
        clipped: z.boolean().optional(),
        content: z.string().max(4000),
        createdAt: timestampSchema,
        id: idSchema,
        senderDescription: z.string().trim().max(500).optional(),
        senderHandle: z.string().trim().min(1).max(128),
        senderType: z.enum(['agent', 'human']),
        sequence: z.number().int().positive(),
    })
    .strict();

export type AgentTaskContextMessage = z.infer<typeof agentTaskContextMessageSchema>;

/**
 * What an Agent mentioned in a Task it has no model-visible context for needs
 * to answer in place: the origin Message the Task started from and the
 * messages before the mention, bounded (Raft's join context).
 */
export const agentTaskContextSchema = z
    .object({
        parentMessage: agentTaskContextMessageSchema,
        parentTarget: z.string().trim().min(1).max(200),
        recentMessages: z.array(agentTaskContextMessageSchema).max(10),
        suggestedReadTarget: z.string().trim().min(1).max(200),
        taskTarget: z.string().trim().min(1).max(200),
        truncated: z.boolean(),
    })
    .strict();

export type AgentTaskContext = z.infer<typeof agentTaskContextSchema>;

/** One Server-owned message envelope durably accepted into a Computer inbox. */
export const agentInboxItemSchema = z
    .object({
        chatId: idSchema,
        claim: messageClaimSchema.optional(),
        content: z.string().max(32_000),
        createdAt: timestampSchema,
        id: idSchema,
        /** This item names the Agent personally: a DM, an @mention, or a committed Jev narrow. */
        addressed: z.boolean().optional(),
        addressedReason: addressedReasonSchema.optional(),
        /** Canonical Agent API shape cached for Computer-local message checks. */
        message: z.record(z.string(), z.unknown()).optional(),
        mentioned: z.boolean().optional(),
        /** Typed Server attention; unlike a Chat message, it has no message cursor. */
        pullRequestNotice: pullRequestChangeSchema.optional(),
        /** Bounded direct-parent and chain-root context for an inline reply. */
        reply: chatMessageReplySchema.nullable().optional(),
        senderDescription: z.string().trim().max(500).optional(),
        senderHandle: z.string().trim().min(1).max(128),
        /** The human sender's saved IANA zone; absent for Agents and humans without one. */
        senderTimezone: humanTimezoneSchema.optional(),
        senderType: z.enum(['agent', 'human', 'system', 'trigger']),
        /** Chat sequence, or zero for a typed attention with no Chat cursor. */
        sequence: z.number().int().nonnegative(),
        target: z.string().trim().min(1).max(200),
        taskContext: agentTaskContextSchema.optional(),
        taskFollowReactivated: z.boolean().optional(),
    })
    .strict()
    .refine(
        (item) =>
            item.pullRequestNotice
                ? item.sequence === 0 && item.senderType === 'system'
                : item.sequence > 0,
        {
            message: 'Typed attentions are system items with zero Chat sequence.',
            path: ['sequence'],
        }
    )
    .refine((item) => item.senderTimezone === undefined || item.senderType === 'human', {
        message: 'Only a human sender carries a timezone.',
        path: ['senderTimezone'],
    });

export type AgentInboxItem = z.infer<typeof agentInboxItemSchema>;

/**
 * One Drive push's conflicts for the Agent that pushed (specs/inbox.md). It lists every kept-both, kept-edit, or refused file of the push,
 * uncapped because conflicts are rare.
 */
export const driveConflictAttentionSchema = z
    .object({
        files: z.array(driveConflictFileSchema).min(1),
        id: idSchema,
        pushId: idSchema,
        writer: z.object({ agentId: idSchema, type: z.literal('agent') }).strict(),
    })
    .strict();

export type DriveConflictAttention = z.infer<typeof driveConflictAttentionSchema>;
