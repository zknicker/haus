import * as z from 'zod';
import { webSearchProviders } from './pi/pi-web-search.ts';

const apiKey = z.string().trim().min(1).optional();
const dataDir = z.string().trim().min(1).default('/data');
const webSearch = z
    .string()
    .default(webSearchProviders.join(','))
    .transform((list) =>
        list
            .split(',')
            .map((name) => name.trim())
            .filter((name) => name !== '')
    )
    .pipe(z.array(z.enum(webSearchProviders)));

const configSchema = z.object({
    HAUS_RUNNER_CLAUDE_SETUP_TOKEN: z.string().trim().min(1).optional(),
    HAUS_RUNNER_DATA_DIR: dataDir,
    HAUS_RUNNER_GEMINI_API_KEY: apiKey,
    HAUS_RUNNER_MAX_WARM: z.coerce.number().int().positive().max(256).default(16),
    HAUS_RUNNER_OPENROUTER_API_KEY: apiKey,
    HAUS_RUNNER_TOKEN: z.string().min(32).max(512),
    HAUS_RUNNER_WEB_SEARCH: webSearch,
    HAUS_RUNNER_XAI_API_KEY: apiKey,
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
        claudeSetupToken: env.HAUS_RUNNER_CLAUDE_SETUP_TOKEN ?? null,
        dataDir: env.HAUS_RUNNER_DATA_DIR,
        geminiApiKey: env.HAUS_RUNNER_GEMINI_API_KEY ?? null,
        maxWarm: env.HAUS_RUNNER_MAX_WARM,
        openrouterApiKey: env.HAUS_RUNNER_OPENROUTER_API_KEY ?? null,
        runnerToken: env.HAUS_RUNNER_TOKEN,
        serverUrl: env.HAUS_SERVER_URL.replace(/\/+$/u, ''),
        webSearch: env.HAUS_RUNNER_WEB_SEARCH,
        xaiApiKey: env.HAUS_RUNNER_XAI_API_KEY ?? null,
    } as const;
}

export function parseRunnerDataDir(environment: Record<string, string | undefined>) {
    return dataDir.parse(environment.HAUS_RUNNER_DATA_DIR || undefined);
}

function setVariables(environment: Record<string, string | undefined>) {
    return Object.fromEntries(Object.entries(environment).filter(([, value]) => value !== ''));
}
