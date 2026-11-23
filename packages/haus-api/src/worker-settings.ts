import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { workerComputerNameSchema, workerPlaceSchema } from './worker-place.ts';
import { workerRepositorySchema } from './worker-shared.ts';

const computerWorkerLimitSchema = z.number().int().min(1).max(50);
const checkoutPathSchema = z.string().trim().min(1).max(1024);

/**
 * `computer.setWorkers`: the **Workers can run here** switch and its limit.
 * Only the attacher turns it on; the attacher, an Owner, or an Admin turns it
 * off or changes the limit. Turning it off refuses
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
 * or an Admin. `canEnableWorkers` is whether the viewer may turn the switch
 * on: the attacher only (ADR 0057 decision 4).
 */
export const computerWorkerSettingsSchema = z
    .object({
        canChangeWorkers: z.boolean(),
        canEnableWorkers: z.boolean(),
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

/** `project.addRepo`: a repository the Project's Workers run in. Publishes `project.updated`. */
export const projectAddRepoInputSchema = z
    .object({ projectId: idSchema, repository: workerRepositorySchema, serverId: idSchema })
    .strict();
export type ProjectAddRepoInput = z.infer<typeof projectAddRepoInputSchema>;

/** `project.removeRepo`: drops the repo and every Computer's link to it. */
export const projectRemoveRepoInputSchema = z
    .object({ projectRepoId: idSchema, serverId: idSchema })
    .strict();
export type ProjectRemoveRepoInput = z.infer<typeof projectRemoveRepoInputSchema>;

/**
 * `project.linkRepo`: links a Project repo on one Computer; the attacher, an
 * Owner, or an Admin links it. A null `checkoutPath` has the Computer clone
 * into its own data root on first use.
 */
export const projectLinkRepoInputSchema = z
    .object({
        checkoutPath: checkoutPathSchema.nullable(),
        computerId: idSchema,
        projectRepoId: idSchema,
        serverId: idSchema,
    })
    .strict();
export type ProjectLinkRepoInput = z.infer<typeof projectLinkRepoInputSchema>;

export const projectUnlinkRepoInputSchema = z
    .object({ computerId: idSchema, projectRepoId: idSchema, serverId: idSchema })
    .strict();
export type ProjectUnlinkRepoInput = z.infer<typeof projectUnlinkRepoInputSchema>;

/** One Computer's link to a Project repo; a null `checkoutPath` clones into its data root. */
export const projectRepoLinkSchema = z
    .object({
        checkoutPath: checkoutPathSchema.nullable(),
        computerId: idSchema,
        computerName: workerComputerNameSchema,
    })
    .strict();
export type ProjectRepoLink = z.infer<typeof projectRepoLinkSchema>;

/** A repository the Project's Workers run in, with each Computer it is linked on. */
export const projectRepoSchema = z
    .object({
        id: idSchema,
        links: z.array(projectRepoLinkSchema),
        repository: workerRepositorySchema,
    })
    .strict();
export type ProjectRepo = z.infer<typeof projectRepoSchema>;
