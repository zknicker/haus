import * as z from 'zod';

export const workerStepKinds = ['read', 'edit', 'run', 'search'] as const;
export const workerStepsRetained = 40;

/**
 * One tool step a Worker turn took, as its carrier summarizes it: never the
 * raw transcript, the command output, or file contents. `label` is a repo
 * path for `read` and `edit`, the command line for `run`, and the query for
 * `search`. Line counts are set only on `edit`; `ok` only on `run`.
 */
export const workerStepSchema = z
    .object({
        additions: z.number().int().nonnegative().nullable(),
        deletions: z.number().int().nonnegative().nullable(),
        kind: z.enum(workerStepKinds),
        label: z.string().trim().min(1).max(200),
        ok: z.boolean().nullable(),
    })
    .strict();

/** A turn's steps in the order they ran, the newest `workerStepsRetained` kept. */
export const workerStepsSchema = z.array(workerStepSchema).max(workerStepsRetained);

export type WorkerStep = z.infer<typeof workerStepSchema>;
export type WorkerStepKind = WorkerStep['kind'];
