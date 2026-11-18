import * as z from 'zod';
import {
    taskDescriptionSchema,
    taskDueOnSchema,
    taskPrioritySchema,
    taskTitleSchema,
} from './task.ts';
import { taskKeySchema } from './task-key.ts';
import { taskKeyPrefixSchema } from './task-key-ledger.ts';
import { taskStateSchema } from './task-state.ts';

const expectedVersionSchema = z.number().int().positive();
const labelNamesSchema = z.array(z.string().trim().min(1).max(80)).max(50);

/** An assignee as an Agent writes it: `me`, or the handle of a person or Agent of the Server. */
const assigneeRefSchema = z.string().trim().min(1).max(64);

const commaListSchema = z
    .union([z.string(), z.array(z.string())])
    .transform((value) =>
        (Array.isArray(value) ? value : [value]).flatMap((part) => part.split(','))
    );

/**
 * `GET /api/agent/tasks`. `state` takes a comma list or a repeated parameter;
 * without it, the unfinished states. `key` names a key-ledger entry (`SEC`).
 */
export const agentTaskListQuerySchema = z.object({
    assignee: z
        .string()
        .regex(/^(me|none|@\S+)$/u)
        .optional(),
    key: taskKeyPrefixSchema.optional(),
    state: commaListSchema.pipe(z.array(taskStateSchema).min(1)).optional(),
});

export const agentTaskShowQuerySchema = z.object({ key: taskKeySchema });

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

export type AgentTaskListQuery = z.infer<typeof agentTaskListQuerySchema>;
export type AgentTaskUpdateInput = z.infer<typeof agentTaskUpdateInputSchema>;
export type AgentTaskAssignInput = z.infer<typeof agentTaskAssignInputSchema>;
