import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { taskKeySchema } from './task-key.ts';
import { taskStateSchema } from './task-state.ts';
import {
    taskAssigneeSchema,
    taskDescriptionSchema,
    taskDueOnSchema,
    taskPrioritySchema,
    taskTitleSchema,
} from './task.ts';

const expectedVersionSchema = z.number().int().positive();

/** Label ids a Task carries, from the Server's task label catalog; no repeats. */
const taskLabelIdsSchema = z
    .array(idSchema)
    .refine((ids) => new Set(ids).size === ids.length, 'Label ids must be unique.');

/** Whose Tasks a list keeps: one person, one Agent, or unassigned ones. */
export const taskListAssigneeFilterSchema = z.union([
    z.object({ userId: idSchema }).strict(),
    z.object({ agentId: idSchema }).strict(),
    z.literal('none'),
]);

export const taskListInputSchema = z
    .object({
        assignee: taskListAssigneeFilterSchema.optional(),
        keyId: idSchema.optional(),
        serverId: idSchema,
        states: z.array(taskStateSchema).min(1).optional(),
    })
    .strict();

/**
 * `task.listOpen`: every `open` Task on the Server, for the sidebar (decision 8).
 * Answers with `taskListSchema`.
 */
export const taskListOpenInputSchema = z.object({ serverId: idSchema }).strict();

/**
 * `task.setState`. Anyone who can see the Task may change its state. Closing
 * cancels its pending reminders; reopening does not restore them (decision 16).
 * Answers with `taskMutationResultSchema`.
 */
export const taskSetStateInputSchema = z
    .object({
        expectedVersion: expectedVersionSchema,
        serverId: idSchema,
        state: taskStateSchema,
        taskId: idSchema,
    })
    .strict();

/** `task.setFollow`: follow or unfollow a Task by hand (decision 9). */
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

/** Address a Task by id, or by its key (`SEC-12`). */
export const taskGetInputSchema = z.union([
    z.object({ serverId: idSchema, taskId: idSchema }).strict(),
    z.object({ key: taskKeySchema, serverId: idSchema }).strict(),
]);

export const taskUpdateInputSchema = z
    .object({
        expectedVersion: expectedVersionSchema,
        patch: z
            .object({
                description: taskDescriptionSchema.optional(),
                dueOn: taskDueOnSchema.nullable().optional(),
                labelIds: taskLabelIdsSchema.optional(),
                priority: taskPrioritySchema.optional(),
                title: taskTitleSchema.optional(),
            })
            .strict()
            .refine((patch) => Object.keys(patch).length > 0, 'Provide at least one task field.'),
        serverId: idSchema,
        taskId: idSchema,
    })
    .strict();

/** `assignee: null` unassigns. */
export const taskAssignInputSchema = z
    .object({
        assignee: taskAssigneeSchema.nullable(),
        expectedVersion: expectedVersionSchema,
        serverId: idSchema,
        taskId: idSchema,
    })
    .strict();

/**
 * `POST /api/agent/tasks/start` (openapi `AgentTaskStartRequest`): an Agent
 * starts a Task from Message `from` in Channel `target` (ADR 0053 decision 4).
 */
export const agentTaskStartInputSchema = z
    .object({
        assignee: z.string().trim().min(1).max(64).optional(),
        description: taskDescriptionSchema.optional(),
        dueOn: taskDueOnSchema.optional(),
        from: idSchema,
        priority: taskPrioritySchema.optional(),
        state: z.enum(['todo', 'open']).optional(),
        target: z.string().trim().min(1).max(200),
        title: taskTitleSchema,
    })
    .strict();

/** `POST /api/agent/tasks/state` (openapi `AgentTaskStateRequest`). */
export const agentTaskStateInputSchema = z
    .object({
        expectedVersion: expectedVersionSchema.optional(),
        key: taskKeySchema,
        state: taskStateSchema,
    })
    .strict();

export type AgentTaskStartInput = z.infer<typeof agentTaskStartInputSchema>;
export type AgentTaskStateInput = z.infer<typeof agentTaskStateInputSchema>;
export type TaskListAssigneeFilter = z.infer<typeof taskListAssigneeFilterSchema>;
export type TaskListInput = z.infer<typeof taskListInputSchema>;
export type TaskGetInput = z.infer<typeof taskGetInputSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateInputSchema>;
export type TaskAssignInput = z.infer<typeof taskAssignInputSchema>;
export type TaskListOpenInput = z.infer<typeof taskListOpenInputSchema>;
export type TaskSetStateInput = z.infer<typeof taskSetStateInputSchema>;
export type TaskSetFollowInput = z.infer<typeof taskSetFollowInputSchema>;
export type TaskFollowReceipt = z.infer<typeof taskFollowReceiptSchema>;
