import * as z from 'zod';

/** The native harnesses a Computer place runs a Worker in (specs/workers.md "Run a turn"). */
export const workerRuntimes = ['claude-code', 'codex'] as const;
export const workerRuntimeSchema = z.enum(workerRuntimes);
export type WorkerRuntime = z.infer<typeof workerRuntimeSchema>;

/** A model id as requested; null leaves the runtime's own default. */
export const workerModelSchema = z.string().trim().min(1).max(200);

/** A Computer's reading of one Worker runtime, reported in its inventory. */
export const workerRuntimeReadinessSchema = z
    .object({
        detail: z.string().trim().min(1).max(500).nullable(),
        ready: z.boolean(),
        runtime: workerRuntimeSchema,
    })
    .strict();
export type WorkerRuntimeReadiness = z.infer<typeof workerRuntimeReadinessSchema>;
