import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
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

export const TASK_BRIEF_MAX_CHARS = 20_000;

export const taskBriefSchema = z.string().trim().min(1).max(TASK_BRIEF_MAX_CHARS);

/** The starter's idempotency key: a retried start with the same id returns the same Task. */
export const taskStartRequestIdSchema = z.string().trim().min(1).max(128);

/** A model the Server's model logins run, by id; the harness follows the model. */
export const taskModelSchema = z.string().trim().min(1).max(128);

/**
 * `task.start`: a person starts a Task in a Project (ADR 0062). The prompt is its first message.
 * The Machine defaults to the Project's default Machine, and the title to a summary of the
 * prompt. With `origin`, that Channel message becomes its origin. Answers with
 * `taskMutationResultSchema`; the same `requestId` answers the same Task.
 */
export const taskStartInputSchema = z
    .object({
        computerId: idSchema.optional(),
        model: taskModelSchema,
        origin: z.object({ chatId: idSchema, messageId: idSchema }).strict().optional(),
        projectId: idSchema,
        prompt: taskBriefSchema,
        requestId: taskStartRequestIdSchema,
        serverId: idSchema,
        title: taskTitleSchema.optional(),
    })
    .strict();

/**
 * `POST /api/agent/tasks/start` (openapi `AgentTaskStartRequest`): a Captain starts crew in its
 * home Project with `brief` as the first message. `target` names the chat it answers in, and
 * `from` a message there that becomes the origin. `machine` and `model` default to the
 * Captain's crew Machine and crew model, then the Project's default Machine and the Captain's
 * own model. `issue` links and assigns that Issue to the Task without changing its state.
 */
export const agentTaskStartInputSchema = z
    .object({
        brief: taskBriefSchema,
        from: idSchema.optional(),
        issue: z.string().trim().min(1).max(64).optional(),
        machine: z.string().trim().min(1).max(200).optional(),
        model: taskModelSchema.optional(),
        /** A Server repo, `owner/name`, the Task checks out first; `ref` is its starting ref. */
        ref: z.string().trim().min(1).max(200).optional(),
        repo: z
            .string()
            .trim()
            .regex(/^[\w.-]+\/[\w.-]+$/u, 'Name the repo as owner/name.')
            .optional(),
        requestId: taskStartRequestIdSchema.optional(),
        target: z.string().trim().min(1).max(200).optional(),
        title: taskTitleSchema.optional(),
    })
    .strict()
    .refine((input) => input.from === undefined || input.target !== undefined, {
        message: 'Name the chat of the `from` message with `target`.',
        path: ['target'],
    })
    .refine((input) => input.ref === undefined || input.repo !== undefined, {
        message: 'Name the repo of the `ref` with `repo`.',
        path: ['repo'],
    });

export type AgentTaskStartInput = z.infer<typeof agentTaskStartInputSchema>;
export type TaskStartInput = z.infer<typeof taskStartInputSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>;
export type TaskListInput = z.infer<typeof taskListInputSchema>;
export type TaskGetInput = z.infer<typeof taskGetInputSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateInputSchema>;
export type TaskListActiveInput = z.infer<typeof taskListActiveInputSchema>;
export type TaskArchiveInput = z.infer<typeof taskArchiveInputSchema>;
export type TaskSetFollowInput = z.infer<typeof taskSetFollowInputSchema>;
export type TaskFollowReceipt = z.infer<typeof taskFollowReceiptSchema>;
