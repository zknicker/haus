import * as z from 'zod';
import { columnCategorySchema } from './board.ts';
import { idSchema } from './chat-contract-primitives.ts';
import {
    taskAssigneeSchema,
    taskDescriptionSchema,
    taskDueOnSchema,
    taskPrioritySchema,
    taskTitleSchema,
} from './task.ts';
import { taskKeySchema } from './task-key.ts';

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
        boardId: idSchema.optional(),
        categories: z.array(columnCategorySchema).min(1).optional(),
        serverId: idSchema,
    })
    .strict();

/** Address a Task by id, or by its key (`SEC-12`). */
export const taskGetInputSchema = z.union([
    z.object({ serverId: idSchema, taskId: idSchema }).strict(),
    z.object({ key: taskKeySchema, serverId: idSchema }).strict(),
]);

/**
 * `task.create`. `columnId` defaults to the board's first `todo` column. With
 * `sourceMessageId` (Convert to Task) the description defaults to that
 * message's content and the message is recorded in Mentioned in.
 */
export const taskCreateInputSchema = z
    .object({
        assignee: taskAssigneeSchema.optional(),
        boardId: idSchema,
        columnId: idSchema.optional(),
        description: taskDescriptionSchema.optional(),
        dueOn: taskDueOnSchema.optional(),
        labelIds: taskLabelIdsSchema.optional(),
        priority: taskPrioritySchema.optional(),
        serverId: idSchema,
        sourceMessageId: idSchema.optional(),
        title: taskTitleSchema,
    })
    .strict();

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

/** Move within the Task's own board; there is no cross-board move. */
export const taskMoveInputSchema = z
    .object({
        columnId: idSchema,
        expectedVersion: expectedVersionSchema,
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

export type TaskListAssigneeFilter = z.infer<typeof taskListAssigneeFilterSchema>;
export type TaskListInput = z.infer<typeof taskListInputSchema>;
export type TaskGetInput = z.infer<typeof taskGetInputSchema>;
export type TaskCreateInput = z.infer<typeof taskCreateInputSchema>;
export type TaskUpdateInput = z.infer<typeof taskUpdateInputSchema>;
export type TaskMoveInput = z.infer<typeof taskMoveInputSchema>;
export type TaskAssignInput = z.infer<typeof taskAssignInputSchema>;
