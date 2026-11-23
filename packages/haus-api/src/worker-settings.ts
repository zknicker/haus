import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { workerPlaceSchema } from './worker-place.ts';

const computerWorkerLimitSchema = z.number().int().min(1).max(50);

/**
 * `computer.setWorkers`: the **Workers can run here** switch and its limit.
 * Only the attacher, an Owner, or an Admin calls it. Turning it off refuses
 * new starts, settles queued turns `place-off`, and clears Project defaults
 * that name the Computer. Publishes `computer.updated`.
 */
export const computerSetWorkersInputSchema = z
    .object({
        computerId: idSchema,
        enabled: z.boolean(),
        limit: computerWorkerLimitSchema.optional(),
        serverId: idSchema,
    })
    .strict();
export type ComputerSetWorkersInput = z.infer<typeof computerSetWorkersInputSchema>;

/**
 * The switch and limit as `computer.list` shows them. `canChangeWorkers` is
 * whether the viewer may call `computer.setWorkers`: the attacher, an Owner,
 * or an Admin.
 */
export const computerWorkerSettingsSchema = z
    .object({
        canChangeWorkers: z.boolean(),
        workerLimit: computerWorkerLimitSchema,
        workersEnabled: z.boolean(),
    })
    .strict();
export type ComputerWorkerSettings = z.infer<typeof computerWorkerSettingsSchema>;

/**
 * `project.setDefaultWorkerPlace`: where the Project's Workers run unless the
 * Agent names a place; null asks for one. A Computer default needs its switch
 * on. Publishes `project.updated`.
 */
export const projectSetDefaultWorkerPlaceInputSchema = z
    .object({ place: workerPlaceSchema.nullable(), projectId: idSchema, serverId: idSchema })
    .strict();
export type ProjectSetDefaultWorkerPlaceInput = z.infer<
    typeof projectSetDefaultWorkerPlaceInputSchema
>;
