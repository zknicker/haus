import * as z from 'zod';

const taskIdSchema = z.string().trim().min(1);

export const taskStatuses = ['todo', 'in_progress', 'in_review', 'done', 'closed'] as const;
export const taskPriorities = ['none', 'urgent', 'high', 'medium', 'low'] as const;

/**
 * How the task row came to exist. `composed` is a human composing a message as
 * a task, `converted` a human promoting an existing message, and `claimed` an
 * Agent taking the claim-before-work lock on a message nobody had promoted.
 */
export const taskOrigins = ['composed', 'converted', 'claimed'] as const;

/**
 * Which lens a task belongs to. A `background` task is an Agent's
 * record-keeping lock on work it finished inside one turn; it stays queryable
 * but off the default Board and List. Everything else is `tracked`.
 */
export const taskTiers = ['background', 'tracked'] as const;
export const taskLabelColors = [
    'red',
    'orange',
    'amber',
    'green',
    'teal',
    'blue',
    'purple',
    'pink',
    'gray',
] as const;

export const taskLabelSchema = z
    .object({
        color: z.enum(taskLabelColors),
        id: taskIdSchema,
        name: z.string().trim().min(1).max(80),
    })
    .strict();

export const messageTaskSchema = z
    .object({
        /** Tasks are Agent work (ADR 0037): only an Agent ever holds one. */
        assigneeAgentId: taskIdSchema.nullable(),
        chatId: taskIdSchema,
        claimedAt: z.iso.datetime({ offset: true }).nullable(),
        createdAt: z.iso.datetime({ offset: true }),
        createdByAgentId: taskIdSchema.nullable(),
        createdByUserId: taskIdSchema.nullable(),
        labels: z.array(taskLabelSchema),
        /** The assignee Agent is running a turn on this task right now. */
        live: z.boolean(),
        messageId: taskIdSchema,
        number: z.number().int().positive(),
        origin: z.enum(taskOrigins),
        priority: z.enum(taskPriorities),
        status: z.enum(taskStatuses),
        threadChatId: taskIdSchema,
        tier: z.enum(taskTiers),
        updatedAt: z.iso.datetime({ offset: true }),
        version: z.number().int().positive(),
    })
    .strict();

/**
 * The structured refusal a losing claimant receives. The claim is a
 * concurrency lock over conflicting execution and nothing else, so the blocked
 * set is closed and the unblocked examples are deliberately illustrative.
 */
export const taskClaimConflictSchema = z
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
        status: z.enum(taskStatuses).nullable(),
        /** Illustrative and non-exhaustive; never a permission table. */
        unblockedActionExamples: z.array(z.string().trim().min(1)),
    })
    .strict();

/**
 * What each blocked action id reads as in prose. The set is closed: an action
 * with no entry here is not blocked by a claim conflict.
 */
export const taskClaimConflictBlockedActionCopy: Record<string, string> = {
    start_conflicting_execution: 'starting conflicting implementation/change work',
};

/**
 * The sentence that keeps a claim conflict a concurrency lock rather than a
 * verdict. Haus has no reassignment-request command, so the routing fix is
 * the original Thread; the clause naming one is deliberately absent.
 */
export const TASK_CLAIM_CONFLICT_ROUTING_NOTE =
    'This is not a ruling on who owns or leads this lane. If you are its canonical owner or believe it is misrouted: correct the routing in the original thread.';

export type MessageTask = z.infer<typeof messageTaskSchema>;
export type TaskClaimConflict = z.infer<typeof taskClaimConflictSchema>;
export type TaskLabel = z.infer<typeof taskLabelSchema>;
export type TaskOrigin = (typeof taskOrigins)[number];
export type TaskTier = (typeof taskTiers)[number];

/**
 * An `in_review` task whose thread has been quiet this long is closed as stale
 * by Server. Closing is reversible; a human can reopen it.
 */
export const TASK_IN_REVIEW_STALE_DAYS = 7;
