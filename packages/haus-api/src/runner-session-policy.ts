import * as z from 'zod';

/**
 * How the runner hosts one agent's session (ADR 0062, specs/runtime-drivers.md#session-kinds).
 * The Server names it per run, so the runner never learns product nouns: which Drive files are
 * the session's rules, whether it has a memory file, how long its warm process parks, and whether
 * a parked process may idle-compact.
 */
export const runnerSessionPolicySchema = z
    .object({
        idleCompaction: z.boolean(),
        kind: z.enum(['captain', 'task']),
        /** The session's memory file in Drive; null for a session that has none. */
        memoryPath: z.string().min(1).max(512).nullable(),
        /** The Drive rule files the turn carries, outermost first. */
        rulePaths: z.array(z.string().min(1).max(512)).max(8),
        warmIdleMs: z.number().int().positive(),
    })
    .strict();

export type RunnerSessionPolicy = z.infer<typeof runnerSessionPolicySchema>;

export const captainWarmIdleMs = 60 * 60_000;
export const taskWarmIdleMs = 5 * 60_000;
