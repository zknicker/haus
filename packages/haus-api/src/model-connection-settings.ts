import * as z from 'zod';
import { idSchema, timestampSchema } from './chat-contract-primitives.ts';
import {
    credentialFitsProvider,
    modelConnectionAuthKindSchema,
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
        id: idSchema,
        isDefault: z.boolean(),
        label: modelConnectionLabelSchema,
        position: z.number().int().nonnegative(),
        provider: modelProviderSchema,
        status: modelConnectionStatusSchema,
        statusDetail: z.string().nullable(),
        updatedAt: timestampSchema,
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

export const modelConnectionTargetInputSchema = z
    .object({ connectionId: idSchema, serverId: idSchema })
    .strict();
export type ModelConnectionTargetInput = z.infer<typeof modelConnectionTargetInputSchema>;

export const modelConnectionRenameInputSchema = z
    .object({ connectionId: idSchema, label: modelConnectionLabelSchema, serverId: idSchema })
    .strict();
export type ModelConnectionRenameInput = z.infer<typeof modelConnectionRenameInputSchema>;

export const modelSignInStartInputSchema = z
    .object({
        label: modelConnectionLabelSchema,
        provider: modelSignInProviderSchema,
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

/** A device-code sign-in the runner is running for the App: `waiting-for-code → code → connected | failed | cancelled`. */
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
    z
        .object({ ...modelSignInBase, connectionId: idSchema, state: z.literal('connected') })
        .strict(),
    z
        .object({ ...modelSignInBase, detail: z.string().min(1), state: z.literal('failed') })
        .strict(),
    z.object({ ...modelSignInBase, state: z.literal('cancelled') }).strict(),
]);
export type ModelSignIn = z.infer<typeof modelSignInSchema>;

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
