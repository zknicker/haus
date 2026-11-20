import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';

export const modelProviderSchema = z.enum(['claude', 'chatgpt', 'xai', 'gemini', 'openrouter']);
export type ModelProvider = z.infer<typeof modelProviderSchema>;

export const modelConnectionAuthKindSchema = z.enum(['setup-token', 'oauth', 'api-key']);
export type ModelConnectionAuthKind = z.infer<typeof modelConnectionAuthKindSchema>;

/** The sign-in kinds each provider accepts; the first is offered first in the App. */
export const modelProviderAuthKinds = {
    chatgpt: ['oauth'],
    claude: ['setup-token'],
    gemini: ['api-key'],
    openrouter: ['api-key'],
    xai: ['oauth', 'api-key'],
} as const satisfies Record<ModelProvider, readonly ModelConnectionAuthKind[]>;

/** The providers whose own search a connection can turn on: native search, or OpenRouter's web server tool. Claude keeps its native WebSearch outside this switch. */
export const modelProvidersWithWebSearch = [
    'chatgpt',
    'xai',
    'gemini',
    'openrouter',
] as const satisfies readonly ModelProvider[];

export function providerSearchesWeb(provider: ModelProvider) {
    return (modelProvidersWithWebSearch as readonly ModelProvider[]).includes(provider);
}

export const modelSignInProviderSchema = z.enum(['chatgpt', 'xai']);
export type ModelSignInProvider = z.infer<typeof modelSignInProviderSchema>;

export const modelConnectionStatusSchema = z.enum(['ready', 'failed']);
export type ModelConnectionStatus = z.infer<typeof modelConnectionStatusSchema>;

export const modelConnectionLabelSchema = z.string().trim().min(1).max(80);

/** Pi's stored OAuth credential: the token pair, its expiry in epoch ms, and provider extras such as `accountId`. */
export const modelOAuthCredentialSchema = z
    .object({
        access: z.string().min(1).max(16_384),
        expires: z.number().int().nonnegative(),
        refresh: z.string().min(1).max(16_384),
    })
    .catchall(z.union([z.string().max(4096), z.number(), z.boolean(), z.null()]));
export type ModelOAuthCredential = z.infer<typeof modelOAuthCredentialSchema>;

export const modelConnectionCredentialSchema = z.discriminatedUnion('kind', [
    z
        .object({ kind: z.literal('setup-token'), token: z.string().trim().min(8).max(4096) })
        .strict(),
    z.object({ credential: modelOAuthCredentialSchema, kind: z.literal('oauth') }).strict(),
    z.object({ key: z.string().trim().min(8).max(4096), kind: z.literal('api-key') }).strict(),
]);
export type ModelConnectionCredential = z.infer<typeof modelConnectionCredentialSchema>;

export function credentialFitsProvider(
    provider: ModelProvider,
    credential: ModelConnectionCredential
) {
    return (modelProviderAuthKinds[provider] as readonly ModelConnectionAuthKind[]).includes(
        credential.kind
    );
}

/** One connection as the runner holds it: opened, never stored on the runner's disk. */
export const runnerModelConnectionSchema = z
    .object({
        credential: modelConnectionCredentialSchema,
        credentialVersion: z.number().int().positive(),
        id: idSchema,
        label: modelConnectionLabelSchema,
        provider: modelProviderSchema,
        serverId: idSchema,
        webSearch: z.boolean(),
    })
    .strict()
    .refine((connection) => credentialFitsProvider(connection.provider, connection.credential));
export type RunnerModelConnection = z.infer<typeof runnerModelConnectionSchema>;

/** Server → runner: every connection on every Server, sent after hello and on every change. */
export const runnerModelConnectionsFrameSchema = z
    .object({
        connections: z.array(runnerModelConnectionSchema).max(500),
        type: z.literal('runner-model-connections'),
    })
    .strict();
export type RunnerModelConnectionsFrame = z.infer<typeof runnerModelConnectionsFrameSchema>;

/**
 * Runner → Server: Pi rotated an OAuth credential from the Server's `baseVersion`. Stored only if
 * `previousRefresh` still matches; the Server answers with `runner-connection-credential-ack`.
 */
export const runnerConnectionCredentialFrameSchema = z
    .object({
        baseVersion: z.number().int().positive(),
        connectionId: idSchema,
        credential: modelOAuthCredentialSchema,
        previousRefresh: z.string().min(1).max(16_384),
        rotationId: z.uuid(),
        type: z.literal('runner-connection-credential'),
    })
    .strict();
export type RunnerConnectionCredentialFrame = z.infer<typeof runnerConnectionCredentialFrameSchema>;

/**
 * Server → runner, before any snapshot that reflects it. `stored`: the rotation is the Server's
 * credential at `credentialVersion`. `superseded`: another change won, and `credentialVersion` is
 * the Server's current one (`baseVersion` when the connection is gone). `failed`: nothing changed,
 * `credentialVersion` echoes `baseVersion`, and the runner keeps the rotation and resends it.
 */
export const runnerConnectionCredentialAckFrameSchema = z
    .object({
        connectionId: idSchema,
        credentialVersion: z.number().int().positive(),
        result: z.enum(['stored', 'superseded', 'failed']),
        rotationId: z.uuid(),
        type: z.literal('runner-connection-credential-ack'),
    })
    .strict();
export type RunnerConnectionCredentialAckFrame = z.infer<
    typeof runnerConnectionCredentialAckFrameSchema
>;

/** Runner → Server: a connection worked, or a provider refused it. */
export const runnerConnectionStatusFrameSchema = z
    .object({
        connectionId: idSchema,
        detail: z.string().trim().min(1).max(500).optional(),
        status: modelConnectionStatusSchema,
        type: z.literal('runner-connection-status'),
    })
    .strict();
export type RunnerConnectionStatusFrame = z.infer<typeof runnerConnectionStatusFrameSchema>;

/** One plan window as the App's usage meters draw it: the share used and when it resets. */
export const modelConnectionCapacityWindowSchema = z
    .object({
        id: z.string().min(1).max(64),
        label: z.string().min(1).max(64),
        resetsAt: timestampSchema.nullable(),
        usedPercent: z.number().min(0).max(100),
    })
    .strict();
export type ModelConnectionCapacityWindow = z.infer<typeof modelConnectionCapacityWindowSchema>;

/**
 * Runner → Server: a plan connection's capacity as its provider reported it at `readAt`, read with
 * the credential at `credentialVersion`. A failed read sends nothing.
 */
export const runnerConnectionCapacityFrameSchema = z
    .object({
        connectionId: idSchema,
        credentialVersion: z.number().int().positive(),
        readAt: timestampSchema,
        type: z.literal('runner-connection-capacity'),
        windows: z.array(modelConnectionCapacityWindowSchema).max(8),
    })
    .strict();
export type RunnerConnectionCapacityFrame = z.infer<typeof runnerConnectionCapacityFrameSchema>;

/** Server → runner: run a provider's device-code sign-in for the App. */
export const runnerSignInStartFrameSchema = z
    .object({
        provider: modelSignInProviderSchema,
        serverId: idSchema,
        signInId: idSchema,
        type: z.literal('runner-sign-in-start'),
    })
    .strict();
export type RunnerSignInStartFrame = z.infer<typeof runnerSignInStartFrameSchema>;

export const runnerSignInCancelFrameSchema = z
    .object({ signInId: idSchema, type: z.literal('runner-sign-in-cancel') })
    .strict();
export type RunnerSignInCancelFrame = z.infer<typeof runnerSignInCancelFrameSchema>;

/** Runner → Server: the code the person enters at the provider's page. */
export const runnerSignInCodeFrameSchema = z
    .object({
        signInId: idSchema,
        type: z.literal('runner-sign-in-code'),
        userCode: z.string().trim().min(1).max(64),
        verificationUri: z.url({ protocol: /^https$/u }),
    })
    .strict();
export type RunnerSignInCodeFrame = z.infer<typeof runnerSignInCodeFrameSchema>;

export const runnerSignInFinishedFrameSchema = z
    .object({
        result: z.discriminatedUnion('status', [
            z
                .object({ credential: modelOAuthCredentialSchema, status: z.literal('connected') })
                .strict(),
            z
                .object({
                    detail: z.string().trim().min(1).max(500),
                    status: z.enum(['failed', 'cancelled']),
                })
                .strict(),
        ]),
        signInId: idSchema,
        type: z.literal('runner-sign-in-finished'),
    })
    .strict();
export type RunnerSignInFinishedFrame = z.infer<typeof runnerSignInFinishedFrameSchema>;

export const runnerModelConnectionDownFrameSchemas = [
    runnerModelConnectionsFrameSchema,
    runnerConnectionCredentialAckFrameSchema,
    runnerSignInStartFrameSchema,
    runnerSignInCancelFrameSchema,
] as const;

export const runnerModelConnectionUpFrameSchemas = [
    runnerConnectionCapacityFrameSchema,
    runnerConnectionCredentialFrameSchema,
    runnerConnectionStatusFrameSchema,
    runnerSignInCodeFrameSchema,
    runnerSignInFinishedFrameSchema,
] as const;

/** Which provider's connection a model needs. The Server resolves an Agent's connection with it, and the runner opens that provider. */
export function modelProviderFor(modelId: string) {
    if (modelId.includes('/')) {
        return 'openrouter' satisfies ModelProvider;
    }
    if (modelId.startsWith('claude-')) {
        return 'claude' satisfies ModelProvider;
    }
    if (modelId.startsWith('grok-')) {
        return 'xai' satisfies ModelProvider;
    }
    if (modelId.startsWith('gemini-')) {
        return 'gemini' satisfies ModelProvider;
    }
    return 'chatgpt' satisfies ModelProvider;
}
