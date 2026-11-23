import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { repoNameSchema } from './repos.ts';
import { taskKeySchema } from './task-key.ts';
import { workerRuntimeReadinessSchema } from './worker-runtime.ts';

/** `GET /api/agent/workers/places?task=<KEY-n>`: `task` marks the Project default. */
export const workerPlacesInputSchema = z.object({ task: taskKeySchema.optional() }).strict();

const slotsShape = {
    freeSlots: z.number().int().nonnegative(),
    limit: z.number().int().min(1).max(50),
    projectDefault: z.boolean(),
    ready: z.boolean(),
};

/**
 * One Computer place. `repoFolders` are the repos it has a folder for; a Worker
 * there in any other repo clones it first. Every Computer is listed, switch off
 * included, so the Agent can say why one is not usable. `allowed` is whether
 * the Computer's Agent access allows the asking Agent; a start there needs it.
 */
export const computerWorkerPlaceEntrySchema = z
    .object({
        ...slotsShape,
        allowed: z.boolean(),
        computerId: idSchema,
        kind: z.literal('computer'),
        repoFolders: z.array(repoNameSchema).max(500),
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

/** `haus worker places`: every place. */
export const workerPlacesResponseSchema = z
    .object({
        places: z.array(workerPlaceEntrySchema).max(200),
        task: taskKeySchema.nullable(),
    })
    .strict();
export type WorkerPlacesResponse = z.infer<typeof workerPlacesResponseSchema>;
