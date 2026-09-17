import os from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';

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

export function getDefaultClerkIssuerUrl() {
    return 'https://clerk.haus.chat';
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
        HAUS_APP_ORIGIN: z.string().url().default(getDefaultAppOrigin()),
        HAUS_AGENT_E2E_AVATAR_FIXTURE: z.literal('1').optional(),
        HAUS_AGENT_E2E_AVATAR_FIXTURE_PATH: z.string().min(1).optional(),
        HAUS_AGENT_E2E_AVATAR_REQUEST_LOG: z.string().min(1).optional(),
        HAUS_CLERK_API_URL: z.string().url().optional(),
        HAUS_CLERK_ISSUER_URL: z.string().url().default(getDefaultClerkIssuerUrl()),
        HAUS_CLERK_SECRET_KEY: z.string().min(1).optional(),
        HAUS_DEV_CLERK_SIGN_IN_USER_ID: z.string().min(1).optional(),
        HAUS_ATTACHMENT_ROOT: z
            .string()
            .min(1)
            .default(getDefaultHausAttachmentRoot())
            .transform(resolveHomePath),
        HAUS_COMPUTER_RELEASE_MANIFEST_URL: z.string().url().optional(),
        HAUS_DATABASE_URL: z.string().min(1).default(getDefaultDatabaseUrl()),
        HAUS_TYPESAFE_API_KEY: z.string().min(1).optional(),
        HAUS_OPENAI_API_KEY: z.string().min(1).optional(),
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
        if (
            value.HAUS_RELEASE_MANIFEST &&
            (!value.HAUS_CLERK_SECRET_KEY || value.HAUS_CLERK_SECRET_KEY === 'INJECT_ON_HOST')
        ) {
            context.addIssue({
                code: 'custom',
                message: 'HAUS_CLERK_SECRET_KEY is required for a production Haus release.',
                path: ['HAUS_CLERK_SECRET_KEY'],
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
