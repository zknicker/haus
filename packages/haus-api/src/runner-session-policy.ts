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
        /**
         * A Task session's own facts for its instructions: who started it, its linked Issues and
         * the repo it checks out first. Null for a Captain.
         */
        task: z
            .object({
                /** The crew Task's Captain; null for a Task a person started. */
                captainHandle: z.string().min(1).max(64).nullable(),
                issues: z
                    .array(
                        z
                            .object({
                                code: z.string().min(1).max(64),
                                description: z.string().max(20_000),
                                title: z.string().min(1).max(200),
                            })
                            .strict()
                    )
                    .max(10),
                repo: z
                    .object({
                        name: z.string().min(1).max(200),
                        ref: z.string().max(200).nullable(),
                    })
                    .strict()
                    .nullable(),
                shortId: z.string().min(1).max(16),
                title: z.string().min(1).max(200),
            })
            .strict()
            .nullable(),
        warmIdleMs: z.number().int().positive(),
    })
    .strict();

export type RunnerSessionPolicy = z.infer<typeof runnerSessionPolicySchema>;

export const captainWarmIdleMs = 60 * 60_000;
export const taskWarmIdleMs = 5 * 60_000;
