import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { taskKeySchema } from './task-key.ts';
import { workerRuntimeReadinessSchema } from './worker-runtime.ts';
import { workerRepositorySchema } from './worker-shared.ts';

/** `GET /api/agent/workers/places?task=<KEY-n>`: `task` marks the Project default and scopes repos. */
export const workerPlacesInputSchema = z.object({ task: taskKeySchema.optional() }).strict();

const slotsShape = {
    freeSlots: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(50),
    projectDefault: z.boolean(),
    ready: z.boolean(),
};

/**
 * One Computer place. `linkedRepositories` are the repos linked on it, of the
 * Task's Project when `task` is given. Every Computer is listed, switch off
 * included, so the Agent can say why one is not usable.
 */
export const computerWorkerPlaceEntrySchema = z
    .object({
        ...slotsShape,
        computerId: idSchema,
        kind: z.literal('computer'),
        linkedRepositories: z.array(workerRepositorySchema).max(200),
        name: z.string().trim().min(1).max(100).nullable(),
        online: z.boolean(),
        runtimes: z.array(workerRuntimeReadinessSchema).max(2),
        workersEnabled: z.boolean(),
    })
    .strict();

export const workerPlaceEntrySchema = z.discriminatedUnion('kind', [
    computerWorkerPlaceEntrySchema,
    z.object({ ...slotsShape, kind: z.literal('cursor') }).strict(),
    z.object({ ...slotsShape, kind: z.literal('claude') }).strict(),
]);
export type WorkerPlaceEntry = z.infer<typeof workerPlaceEntrySchema>;

/** `haus worker places`: every place, and the Task's Project repos when `task` is given. */
export const workerPlacesResponseSchema = z
    .object({
        places: z.array(workerPlaceEntrySchema).max(200),
        repositories: z.array(workerRepositorySchema).max(200),
        task: taskKeySchema.nullable(),
    })
    .strict();
export type WorkerPlacesResponse = z.infer<typeof workerPlacesResponseSchema>;
