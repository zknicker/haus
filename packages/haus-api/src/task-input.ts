import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { taskKeyPrefixSchema } from './task-key-ledger.ts';
import { taskShortIdSchema } from './task-short-id.ts';
import { taskDescriptionSchema, taskTitleSchema } from './task.ts';

const expectedVersionSchema = z.number().int().positive();

/** `task.list`: active Tasks by default, or archived ones; optionally one Project's. */
export const taskListInputSchema = z
    .object({
        archived: z.boolean().optional(),
        projectId: idSchema.optional(),
        serverId: idSchema,
    })
    .strict();

/** `task.listActive`: every active Task on the Server, for the sidebar. */
export const taskListActiveInputSchema = z.object({ serverId: idSchema }).strict();

/**
 * `task.archive` / `task.unarchive`: set or clear `archived_at`. Archiving
 * cancels the Task's pending reminders; unarchiving does not restore them.
 * Answers with `taskMutationResultSchema`.
 */
export const taskArchiveInputSchema = z
    .object({
        expectedVersion: expectedVersionSchema,
        serverId: idSchema,
        taskId: idSchema,
    })
    .strict();

/** `task.setFollow`: follow or unfollow a Task by hand. */
export const taskSetFollowInputSchema = z
    .object({
        followed: z.boolean(),
        serverId: idSchema,
        taskId: idSchema,
    })
    .strict();

export const taskFollowReceiptSchema = z
    .object({
        followed: z.boolean(),
        serverId: idSchema,
        taskId: idSchema,
    })
    .strict();

/** Address a Task by id, or by its short id (`k3mq7xta`). */
export const taskGetInputSchema = z.union([
    z.object({ serverId: idSchema, taskId: idSchema }).strict(),
    z.object({ serverId: idSchema, shortId: taskShortIdSchema }).strict(),
]);

export const taskUpdateInputSchema = z
    .object({
        expectedVersion: expectedVersionSchema,
        patch: z
            .object({
                description: taskDescriptionSchema.optional(),
                title: taskTitleSchema.optional(),
            })
            .strict()
            .refine((patch) => Object.keys(patch).length > 0, 'Provide at least one task field.'),
        serverId: idSchema,
        taskId: idSchema,
    })
    .strict();

/**
 * `task.create`: a person files a Task in a Project. It has no origin.
 * Answers with `taskMutationResultSchema`.
 */
export const taskCreateInputSchema = z
    .object({
        description: taskDescriptionSchema.optional(),
        projectId: idSchema,
        serverId: idSchema,
        title: taskTitleSchema,
    })
    .strict();

/**
 * `POST /api/agent/tasks/start` (openapi `AgentTaskStartRequest`): an Agent
 * starts a Task from Message `from` in Channel or DM `target` (ADR 0055). The
 * Project is `project` by key, else the origin's channel, else for a DM origin
 * the Agent's home Project.
 */
export const agentTaskStartInputSchema = z
    .object({
        description: taskDescriptionSchema.optional(),
        from: idSchema,
        project: taskKeyPrefixSchema.optional(),
        target: z.string().trim().min(1).max(200),
        title: taskTitleSchema,
    })
    .strict();

export type AgentTaskStartInput = z.infer<typeof agentTaskStartInputSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>;
export type TaskListInput = z.infer<typeof taskListInputSchema>;
export type TaskGetInput = z.infer<typeof taskGetInputSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateInputSchema>;
export type TaskListActiveInput = z.infer<typeof taskListActiveInputSchema>;
export type TaskArchiveInput = z.infer<typeof taskArchiveInputSchema>;
export type TaskSetFollowInput = z.infer<typeof taskSetFollowInputSchema>;
export type TaskFollowReceipt = z.infer<typeof taskFollowReceiptSchema>;
