import * as z from 'zod';
import { taskKeyPrefixSchema } from './task-key-ledger.ts';
import { taskRefSchema } from './task-short-id.ts';

const flagSchema = z.enum(['true', 'false']).transform((value) => value === 'true');

/**
 * `GET /api/agent/tasks`. Without `all`, the Tasks the caller started; without
 * `archived`, active ones only. `project` names a Project by its key (`SEC`).
 */
export const agentTaskListQuerySchema = z.object({
    all: flagSchema.optional(),
    archived: flagSchema.optional(),
    project: taskKeyPrefixSchema.optional(),
});

/** `GET /api/agent/tasks/show`: one Task by short id or full id. */
export const agentTaskShowQuerySchema = z.object({ task: taskRefSchema });

/** `POST /api/agent/tasks/archive`. Without `expectedVersion` the last write wins. */
export const agentTaskArchiveInputSchema = z
    .object({
        expectedVersion: z.number().int().positive().optional(),
        task: taskRefSchema,
    })
    .strict();

export type AgentTaskListQuery = z.infer<typeof agentTaskListQuerySchema>;
export type AgentTaskArchiveInput = z.infer<typeof agentTaskArchiveInputSchema>;
