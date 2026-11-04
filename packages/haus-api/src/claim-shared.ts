import * as z from 'zod';
import { taskLabelSchema, taskPriorities } from './task-labels.ts';

const claimIdSchema = z.string().trim().min(1);

export const claimStatuses = ['todo', 'in_progress', 'in_review', 'done', 'closed'] as const;

/**
 * How the claim row came to exist. `composed` is a human composing a message as
 * a claim, `converted` a human promoting an existing message, and `claimed` an
 * Agent taking the claim-before-work lock on a message nobody had promoted.
 */
export const claimOrigins = ['composed', 'converted', 'claimed'] as const;

/**
 * Which lens a claim belongs to. A `background` claim is an Agent's
 * record-keeping lock on work it finished inside one turn; it stays queryable
 * but off the default Board and List. Everything else is `tracked`.
 */
export const claimTiers = ['background', 'tracked'] as const;

export const messageClaimSchema = z
    .object({
        /** Claims are Agent work (ADR 0037): only an Agent ever holds one. */
        assigneeAgentId: claimIdSchema.nullable(),
        /**
         * The claim's top-level Channel or DM, which numbers it. A claim on a
         * Thread message names that Thread's parent here.
         */
        chatId: claimIdSchema,
        claimedAt: z.iso.datetime({ offset: true }).nullable(),
        createdAt: z.iso.datetime({ offset: true }),
        createdByAgentId: claimIdSchema.nullable(),
        createdByUserId: claimIdSchema.nullable(),
        labels: z.array(taskLabelSchema),
        /** The assignee Agent is running a turn on this claim right now. */
        live: z.boolean(),
        messageId: claimIdSchema,
        number: z.number().int().positive(),
        origin: z.enum(claimOrigins),
        priority: z.enum(taskPriorities),
        status: z.enum(claimStatuses),
        /**
         * Where the claim's work happens: the Thread its message sits in, or for
         * a top-level message the Thread anchored on it (empty until a reply).
         * A Thread claim's message has `chatId !== claim.chatId`.
         */
        threadChatId: claimIdSchema,
        tier: z.enum(claimTiers),
        updatedAt: z.iso.datetime({ offset: true }),
        version: z.number().int().positive(),
    })
    .strict();

/**
 * The structured refusal a losing claimant receives. The claim is a
 * concurrency lock over conflicting execution and nothing else, so the blocked
 * set is closed and the unblocked examples are deliberately illustrative.
 */
export const claimConflictSchema = z
    .object({
        /** Closed set: an action absent here is not blocked by this conflict. */
        blockedActions: z.array(z.string().trim().min(1)),
        claimedAt: z.string().nullable(),
        conflictScope: z.literal('implementation_execution'),
        currentAssignee: z
            .object({ name: z.string().nullable(), type: z.literal('agent') })
            .nullable(),
        kind: z.literal('claim_conflict'),
        /** Assignment state as of this instant: a snapshot, not a standing ruling. */
        observedAt: z.string(),
        status: z.enum(claimStatuses).nullable(),
        /** Illustrative and non-exhaustive; never a permission table. */
        unblockedActionExamples: z.array(z.string().trim().min(1)),
    })
    .strict();

/**
 * What each blocked action id reads as in prose. The set is closed: an action
 * with no entry here is not blocked by a claim conflict.
 */
export const claimConflictBlockedActionCopy: Record<string, string> = {
    start_conflicting_execution: 'starting conflicting implementation/change work',
};

/**
 * The sentence that keeps a claim conflict a concurrency lock rather than a
 * verdict. Haus has no reassignment-request command, so the routing fix is
 * the original Thread; the clause naming one is deliberately absent.
 */
export const CLAIM_CONFLICT_ROUTING_NOTE =
    'This is not a ruling on who owns or leads this lane. If you are its canonical owner or believe it is misrouted: correct the routing in the original thread.';

export type MessageClaim = z.infer<typeof messageClaimSchema>;
export type ClaimConflict = z.infer<typeof claimConflictSchema>;
export type ClaimOrigin = (typeof claimOrigins)[number];
export type ClaimTier = (typeof claimTiers)[number];

/**
 * An `in_review` claim whose thread has been quiet this long is closed as stale
 * by Server. Closing is reversible; a human can reopen it.
 */
export const CLAIM_IN_REVIEW_STALE_DAYS = 7;
