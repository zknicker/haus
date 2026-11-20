import * as z from 'zod';

const configSchema = z.object({
    HAUS_RUNNER_DATA_DIR: z.string().trim().min(1).default('/data'),
    HAUS_RUNNER_MAX_WARM: z.coerce.number().int().positive().max(256).default(16),
    HAUS_RUNNER_TOKEN: z.string().min(32).max(512),
    HAUS_SERVER_URL: z.url({ protocol: /^https?$/u }),
});

export const runnerConfigNames = configSchema.keyof().options;

export type RunnerConfig = ReturnType<typeof parseRunnerConfig>;

export function parseRunnerConfig(environment: Record<string, string | undefined>) {
    const parsed = configSchema.safeParse(setVariables(environment));
    if (!parsed.success) {
        const fields = parsed.error.issues.map((issue) => issue.path.join('.')).join(', ');
        throw new Error(`Runner environment is invalid: ${fields}.`);
    }
    const env = parsed.data;
    return {
        dataDir: env.HAUS_RUNNER_DATA_DIR,
        maxWarm: env.HAUS_RUNNER_MAX_WARM,
        runnerToken: env.HAUS_RUNNER_TOKEN,
        serverUrl: env.HAUS_SERVER_URL.replace(/\/+$/u, ''),
    } as const;
}

function setVariables(environment: Record<string, string | undefined>) {
    return Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== ''));
}
