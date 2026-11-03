import os from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { artifactStorageBytes } from '../artifacts/storage.ts';
import { cloudflareAccessAudience } from '../identity/cloudflare-access.ts';

// There is no env-file loading here on purpose. The committed root
// `.env.schema` is the environment contract and Varlock is the only loader:
// operator entry points run under `varlock run`, and the hosted Server reads
// the `config/server.env` the deploy job renders from that same schema. This
// module only validates and shapes what it is given.

function isTestEnvironment() {
    return process.env.NODE_ENV === 'test';
}

export function getDefaultHausServerPort() {
    const port = process.env.HAUS_SERVER_PORT;

    return port && isValidPort(port) ? Number(port) : 8090;
}

export function getDefaultDatabaseUrl() {
    return `postgres://127.0.0.1:5432/haus${isTestEnvironment() ? '_test' : ''}`;
}

export function getDefaultHausAttachmentRoot() {
    return join(os.homedir(), '.haus', 'server', 'attachments');
}

function resolveHomePath(value: string) {
    if (value === '~') {
        return os.homedir();
    }

    if (value.startsWith('~/')) {
        return join(os.homedir(), value.slice(2));
    }

    return value;
}

export function getDefaultAppOrigin() {
    const websitePort = process.env.HAUS_WEBSITE_PORT;

    return `http://localhost:${isValidPort(websitePort) ? websitePort : '3100'}`;
}

const envSchema = z
    .object({
        // Format is checked by iPhone push setup, which disables push rather than failing boot.
        APPLE_TEAM_ID: z.string().optional(),
        HAUS_APNS_KEY_ID: z.string().min(1).optional(),
        HAUS_APNS_PRIVATE_KEY: z.string().min(1).optional(),
        HAUS_APP_ORIGIN: z.string().url().default(getDefaultAppOrigin()),
        HAUS_ARTIFACT_R2_ENDPOINT: z.string().url().optional(),
        HAUS_ARTIFACT_R2_BUCKET: z.string().min(1).optional(),
        HAUS_ARTIFACT_R2_ACCESS_KEY_ID: z.string().min(1).optional(),
        HAUS_ARTIFACT_R2_SECRET_ACCESS_KEY: z.string().min(1).optional(),
        HAUS_ARTIFACT_R2_SESSION_TOKEN: z.string().min(1).optional(),
        HAUS_ARTIFACT_MAX_BYTES: z.coerce.number().int().positive().default(268_435_456),
        HAUS_ARTIFACT_STORAGE_BYTES: z.coerce
            .number()
            .int()
            .positive()
            .default(artifactStorageBytes),
        HAUS_ENABLE_ARTIFACT_STORAGE: z
            .enum(['false', 'true'])
            .default('false')
            .transform((value) => value === 'true'),
        HAUS_AGENT_E2E_AVATAR_FIXTURE: z.literal('1').optional(),
        HAUS_AGENT_E2E_AVATAR_FIXTURE_PATH: z.string().min(1).optional(),
        HAUS_AGENT_E2E_AVATAR_REQUEST_LOG: z.string().min(1).optional(),
        HAUS_CF_ACCESS_AUDIENCE: z.string().min(1).default(cloudflareAccessAudience),
        HAUS_ATTACHMENT_ROOT: z
            .string()
            .min(1)
            .default(getDefaultHausAttachmentRoot())
            .transform(resolveHomePath),
        HAUS_COMPUTER_RELEASE_MANIFEST_URL: z.string().url().optional(),
        HAUS_DATABASE_URL: z.string().min(1).default(getDefaultDatabaseUrl()),
        HAUS_TYPESAFE_API_KEY: z.string().min(1).optional(),
        HAUS_OPENAI_API_KEY: z.string().min(1).optional(),
        HAUS_GEMINI_API_KEY: z.string().min(1).optional(),
        // The Haus GitHub App (specs/github-app-connection.md#environment). Each
        // is optional; `readGithubAppConfig` treats a partial set as unconfigured.
        HAUS_GITHUB_APP_CLIENT_ID: z.string().min(1).optional(),
        HAUS_GITHUB_APP_CLIENT_SECRET: z.string().min(1).optional(),
        HAUS_GITHUB_APP_ID: z.string().regex(/^\d+$/u).optional(),
        HAUS_GITHUB_APP_PRIVATE_KEY: z.string().min(1).optional(),
        HAUS_GITHUB_APP_SLUG: z.string().min(1).optional(),
        HAUS_GITHUB_APP_WEBHOOK_SECRET: z.string().min(32).optional(),
        // The Haus Linear app (specs/linear-app.md#environment). Each is
        // optional: without them Linear reports unavailable.
        // Development and evals only: a loopback fake Linear (linear-api-origin.ts).
        HAUS_LINEAR_API_ORIGIN: z.string().url().optional(),
        HAUS_LINEAR_APP_CLIENT_ID: z.string().min(1).optional(),
        HAUS_LINEAR_APP_WEBHOOK_SECRET: z.string().min(1).optional(),
        HAUS_LINEAR_APP_WEBHOOK_SECRET_PREVIOUS: z.string().min(1).optional(),
        HAUS_LINEAR_PUBLIC_ORIGIN: z.string().url().optional(),
        HAUS_LINEAR_URL_SIGNING_KEY: z.string().min(32).optional(),
        HAUS_RELEASE_MANIFEST: z.string().min(1).transform(resolveHomePath).optional(),
        HAUS_SERVER_PORT: z.coerce.number().int().positive().default(getDefaultHausServerPort()),
        HAUS_STATIC_APP_ROOT: z.string().min(1).transform(resolveHomePath).optional(),
        OTEL_EXPORTER_OTLP_ENDPOINT: z.string().url().optional(),
        OTEL_EXPORTER_OTLP_HEADERS: z.string().min(1).optional(),
        OTEL_EXPORTER_OTLP_METRICS_ENDPOINT: z.string().url().optional(),
        OTEL_EXPORTER_OTLP_METRICS_HEADERS: z.string().min(1).optional(),
        OTEL_EXPORTER_OTLP_TRACES_ENDPOINT: z.string().url().optional(),
        OTEL_EXPORTER_OTLP_TRACES_HEADERS: z.string().min(1).optional(),
        OTEL_RESOURCE_ATTRIBUTES: z.string().min(1).optional(),
        OTEL_SDK_DISABLED: z.enum(['false', 'true']).optional(),
    })
    .superRefine((value, context) => {
        const artifactKeys = [
            'HAUS_ARTIFACT_R2_ENDPOINT',
            'HAUS_ARTIFACT_R2_BUCKET',
            'HAUS_ARTIFACT_R2_ACCESS_KEY_ID',
            'HAUS_ARTIFACT_R2_SECRET_ACCESS_KEY',
        ] as const;
        if (
            (value.HAUS_ENABLE_ARTIFACT_STORAGE || artifactKeys.some((key) => value[key])) &&
            !artifactKeys.every((key) => value[key])
        ) {
            context.addIssue({
                code: 'custom',
                message: 'Shared artifacts require all four R2 configuration values.',
                path: ['HAUS_ARTIFACT_R2_ENDPOINT'],
            });
        }
    });

export function parseEnvironment(values: NodeJS.ProcessEnv) {
    return envSchema.parse(values);
}

export const env = parseEnvironment(process.env);

function isValidPort(value: string | undefined) {
    if (!(value && /^\d+$/u.test(value))) {
        return false;
    }

    const numericValue = Number(value);

    return Number.isInteger(numericValue) && numericValue > 0 && numericValue <= 65_535;
}
