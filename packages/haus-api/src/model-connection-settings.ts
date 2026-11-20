import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import {
    credentialFitsProvider,
    modelConnectionAuthKindSchema,
    modelConnectionCapacityWindowSchema,
    modelConnectionCredentialSchema,
    modelConnectionLabelSchema,
    modelConnectionStatusSchema,
    modelProviderSchema,
    modelSignInProviderSchema,
} from './model-connections.ts';

/** One connection as Settings shows it: never a credential, nor any hint of one. */
export const modelConnectionSchema = z
    .object({
        authKind: modelConnectionAuthKindSchema,
        /** The plan's capacity windows, or null when the runner has not read them in the last 6 hours. */
        capacity: z.array(modelConnectionCapacityWindowSchema).nullable(),
        id: idSchema,
        isDefault: z.boolean(),
        label: modelConnectionLabelSchema,
        position: z.number().int().nonnegative(),
        provider: modelProviderSchema,
        status: modelConnectionStatusSchema,
        statusDetail: z.string().nullable(),
        updatedAt: timestampSchema,
        webSearch: z.boolean(),
    })
    .strict();
export type ModelConnection = z.infer<typeof modelConnectionSchema>;

export const modelConnectionListSchema = z
    .object({ connections: z.array(modelConnectionSchema) })
    .strict();
export type ModelConnectionList = z.infer<typeof modelConnectionListSchema>;

export const modelConnectionListInputSchema = z.object({ serverId: idSchema }).strict();

/** A pasted setup-token or API key. OAuth connections arrive only through sign-in. */
export const modelConnectionAddInputSchema = z
    .object({
        credential: modelConnectionCredentialSchema,
        label: modelConnectionLabelSchema,
        provider: modelProviderSchema,
        serverId: idSchema,
    })
    .strict()
    .refine(
        (input) =>
            input.credential.kind !== 'oauth' &&
            credentialFitsProvider(input.provider, input.credential),
        { message: 'That provider does not accept this kind of credential.', path: ['credential'] }
    );
export type ModelConnectionAddInput = z.infer<typeof modelConnectionAddInputSchema>;

/** A new pasted setup-token or API key for an existing connection of that kind; the id, label, order, web search and Agent pins stay. */
export const modelConnectionReplaceCredentialInputSchema = z
    .object({
        connectionId: idSchema,
        credential: modelConnectionCredentialSchema,
        serverId: idSchema,
    })
    .strict()
    .refine((input) => input.credential.kind !== 'oauth', {
        message: 'Signed-in connections reconnect by signing in again.',
        path: ['credential'],
    });
export type ModelConnectionReplaceCredentialInput = z.infer<
    typeof modelConnectionReplaceCredentialInputSchema
>;

export const modelConnectionTargetInputSchema = z
    .object({ connectionId: idSchema, serverId: idSchema })
    .strict();
export type ModelConnectionTargetInput = z.infer<typeof modelConnectionTargetInputSchema>;

export const modelConnectionRenameInputSchema = z
    .object({ connectionId: idSchema, label: modelConnectionLabelSchema, serverId: idSchema })
    .strict();
export type ModelConnectionRenameInput = z.infer<typeof modelConnectionRenameInputSchema>;

export const modelConnectionSetWebSearchInputSchema = z
    .object({ connectionId: idSchema, enabled: z.boolean(), serverId: idSchema })
    .strict();
export type ModelConnectionSetWebSearchInput = z.infer<
    typeof modelConnectionSetWebSearchInputSchema
>;

/** With `replaceConnectionId`, the signed-in credential replaces that connection's in place instead of adding one. */
export const modelSignInStartInputSchema = z
    .object({
        label: modelConnectionLabelSchema,
        provider: modelSignInProviderSchema,
        replaceConnectionId: idSchema.optional(),
        serverId: idSchema,
    })
    .strict();
export type ModelSignInStartInput = z.infer<typeof modelSignInStartInputSchema>;

export const modelSignInTargetInputSchema = z
    .object({ serverId: idSchema, signInId: idSchema })
    .strict();
export type ModelSignInTargetInput = z.infer<typeof modelSignInTargetInputSchema>;

const modelSignInBase = {
    expiresAt: timestampSchema,
    label: modelConnectionLabelSchema,
    provider: modelSignInProviderSchema,
    signInId: idSchema,
};

/** A device-code sign-in the runner is running for the App: `waiting-for-code → code → storing → connected | failed`, or `cancelled` before `storing`. */
export const modelSignInSchema = z.discriminatedUnion('state', [
    z.object({ ...modelSignInBase, state: z.literal('waiting-for-code') }).strict(),
    z
        .object({
            ...modelSignInBase,
            state: z.literal('code'),
            userCode: z.string().min(1),
            verificationUri: z.url(),
        })
        .strict(),
    z.object({ ...modelSignInBase, state: z.literal('storing') }).strict(),
    z
        .object({ ...modelSignInBase, connectionId: idSchema, state: z.literal('connected') })
        .strict(),
    z
        .object({ ...modelSignInBase, detail: z.string().min(1), state: z.literal('failed') })
        .strict(),
    z.object({ ...modelSignInBase, state: z.literal('cancelled') }).strict(),
]);
export type ModelSignIn = z.infer<typeof modelSignInSchema>;

/** A `storing` sign-in cannot be cancelled (`completing`); the App waits for it to land. A `connected` or `failed` one is `finished`. */
export const modelSignInCancelResultSchema = z.discriminatedUnion('cancelled', [
    z.object({ cancelled: z.literal(true), signIn: modelSignInSchema }).strict(),
    z.object({ cancelled: z.literal(false), reason: z.enum(['completing', 'finished']) }).strict(),
]);
export type ModelSignInCancelResult = z.infer<typeof modelSignInCancelResultSchema>;

export const modelConnectionAssignAgentInputSchema = z
    .object({ agentId: idSchema, connectionId: idSchema.nullable(), serverId: idSchema })
    .strict();
export type ModelConnectionAssignAgentInput = z.infer<typeof modelConnectionAssignAgentInputSchema>;

export const modelConnectionAgentAssignmentSchema = z
    .object({ agentId: idSchema, modelConnectionId: idSchema.nullable() })
    .strict();

/** A connection or a sign-in changed on this Server; the App refetches `modelConnections.list` and `modelConnections.signIn`. */
export const modelConnectionsUpdatedEventSchema = z.object({ serverId: idSchema }).strict();
export type ModelConnectionsUpdatedEvent = z.infer<typeof modelConnectionsUpdatedEventSchema>;
