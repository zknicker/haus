import * as z from 'zod';
import {
    boardColumnDraftSchema,
    boardKeySchema,
    boardNameSchema,
    columnCategorySchema,
} from './board.ts';
import { idSchema } from './chat-contract-primitives.ts';
import {
    taskDescriptionSchema,
    taskDueOnSchema,
    taskPrioritySchema,
    taskTitleSchema,
} from './task.ts';
import { taskKeySchema } from './task-key.ts';

const expectedVersionSchema = z.number().int().positive();
const labelNamesSchema = z.array(z.string().trim().min(1).max(80)).max(50);

/** An assignee as an Agent writes it: `me`, or the handle of a person or Agent of the Server. */
const assigneeRefSchema = z.string().trim().min(1).max(64);

/** `GET /api/agent/tasks`. `category` is a comma list; omitted means the open categories. */
export const agentTaskListQuerySchema = z.object({
    assignee: z
        .string()
        .regex(/^(me|none|@\S+)$/u)
        .optional(),
    board: boardKeySchema.optional(),
    category: z
        .string()
        .transform((value) => value.split(','))
        .pipe(z.array(columnCategorySchema))
        .optional(),
});

export const agentTaskShowQuerySchema = z.object({ key: taskKeySchema });

export const agentTaskCreateInputSchema = z
    .object({
        assignee: assigneeRefSchema.optional(),
        board: boardKeySchema,
        /** A column name or id on the board; defaults to its first `todo` column. */
        column: z.string().trim().min(1).optional(),
        description: taskDescriptionSchema.optional(),
        dueOn: taskDueOnSchema.optional(),
        labels: labelNamesSchema.optional(),
        priority: taskPrioritySchema.optional(),
        title: taskTitleSchema,
    })
    .strict();

/** Without `expectedVersion`, the Server uses the current one: the last write wins for Agents. */
export const agentTaskMoveInputSchema = z
    .object({
        column: z.string().trim().min(1),
        expectedVersion: expectedVersionSchema.optional(),
        key: taskKeySchema,
    })
    .strict();

export const agentTaskUpdateInputSchema = z
    .object({
        description: taskDescriptionSchema.optional(),
        dueOn: taskDueOnSchema.nullable().optional(),
        expectedVersion: expectedVersionSchema.optional(),
        key: taskKeySchema,
        labels: labelNamesSchema.optional(),
        priority: taskPrioritySchema.optional(),
        title: taskTitleSchema.optional(),
    })
    .strict()
    .refine(
        ({ description, dueOn, labels, priority, title }) =>
            [description, dueOn, labels, priority, title].some((field) => field !== undefined),
        'Provide at least one task field.'
    );

/** `assignee: null` unassigns. */
export const agentTaskAssignInputSchema = z
    .object({
        assignee: assigneeRefSchema.nullable(),
        expectedVersion: expectedVersionSchema.optional(),
        key: taskKeySchema,
    })
    .strict();

export const agentBoardCreateInputSchema = z
    .object({ key: boardKeySchema, name: boardNameSchema })
    .strict();

export const agentBoardColumnsInputSchema = z
    .object({
        board: boardKeySchema,
        columns: z.array(boardColumnDraftSchema).min(1),
        expectedVersion: expectedVersionSchema.optional(),
        moveTasks: z.record(idSchema, idSchema).optional(),
    })
    .strict();

export type AgentTaskListQuery = z.infer<typeof agentTaskListQuerySchema>;
export type AgentTaskCreateInput = z.infer<typeof agentTaskCreateInputSchema>;
export type AgentTaskMoveInput = z.infer<typeof agentTaskMoveInputSchema>;
export type AgentTaskUpdateInput = z.infer<typeof agentTaskUpdateInputSchema>;
export type AgentTaskAssignInput = z.infer<typeof agentTaskAssignInputSchema>;
export type AgentBoardCreateInput = z.infer<typeof agentBoardCreateInputSchema>;
export type AgentBoardColumnsInput = z.infer<typeof agentBoardColumnsInputSchema>;
