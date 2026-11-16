import * as z from 'zod';
import { boardColumnNameSchema, boardNameSchema } from './board.ts';
import { idSchema } from './chat-contract-primitives.ts';
import { taskPrioritySchema, taskTitleSchema } from './task.ts';
import { taskKeySchema } from './task-key.ts';

/** Most Task assignments one run or busy notice names; a larger batch drains in further runs. */
export const agentTaskAssignmentBatchLimit = 50;

/**
 * One board Task assigned to the Agent (ADR 0051), as it stood when assigned. `id` is its inbox
 * identity (`task-assign:<taskId>:<version>`). `assignedBy` is the assigner's handle, null for a
 * member who has not claimed one. `assignedByAgent` marks Agent-authored work, which spends the
 * automation chain the way an Agent's message does; a person's assignment resets it.
 */
export const agentTaskAssignmentSchema = z
    .object({
        assignedBy: z.string().min(1).max(128).nullable(),
        assignedByAgent: z.boolean(),
        board: boardNameSchema,
        column: boardColumnNameSchema,
        id: idSchema,
        key: taskKeySchema,
        priority: taskPrioritySchema,
        taskId: idSchema,
        title: taskTitleSchema,
    })
    .strict();

export type AgentTaskAssignment = z.infer<typeof agentTaskAssignmentSchema>;

/** The Task assignments one chatless run carries: every one queued, up to the batch limit. */
export const agentTaskAssignmentsSchema = z
    .array(agentTaskAssignmentSchema)
    .min(1)
    .max(agentTaskAssignmentBatchLimit);

/**
 * Queued Task assignments as a busy notice counts them, content-free: `ids` are the identities
 * the notice acknowledges, `total` everything queued, past the ids a notice can carry.
 */
export const agentTaskAssignmentNoticeSchema = z
    .object({
        ids: z.array(idSchema).min(1).max(agentTaskAssignmentBatchLimit),
        total: z.number().int().positive(),
    })
    .strict();

export type AgentTaskAssignmentNotice = z.infer<typeof agentTaskAssignmentNoticeSchema>;
