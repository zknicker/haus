import * as z from 'zod';

const configSchema = z.object({
    HAUS_RUNNER_CLAUDE_SETUP_TOKEN: z.string().trim().min(1).optional(),
    HAUS_RUNNER_DATA_DIR: z.string().trim().min(1).default('/data'),
    HAUS_RUNNER_MAX_WARM: z.coerce.number().int().positive().max(256).default(16),
    HAUS_RUNNER_TOKEN: z.string().min(32).max(512),
    HAUS_SERVER_URL: z.url({ protocol: /^https?$/u }),
});

export type RunnerConfig = ReturnType<typeof parseRunnerConfig>;

export function parseRunnerConfig(environment: Record<string, string | undefined>) {
    const parsed = configSchema.safeParse(environment);
    if (!parsed.success) {
        const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
        throw new Error(`Runner environment is invalid: ${fields}.`);
    }
    const env = parsed.data;
    return {
        claudeSetupToken: env.HAUS_RUNNER_CLAUDE_SETUP_TOKEN ?? null,
        dataDir: env.HAUS_RUNNER_DATA_DIR,
        maxWarm: env.HAUS_RUNNER_MAX_WARM,
        runnerToken: env.HAUS_RUNNER_TOKEN,
        serverUrl: env.HAUS_SERVER_URL.replace(/\/+$/u, ''),
    } as const;
}
