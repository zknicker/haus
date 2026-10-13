import * as z from 'zod';
import { idSchema } from './chat.ts';
import { traceCarrierSchema } from './trace-context.ts';

/**
 * Computer Secrets: one 1Password vault shared by every Agent on one Computer
 * attachment. The read-only service account token lives only on the Computer.
 * Server relays it once, in memory, and never stores or logs it; every status
 * shape below carries names, never values.
 */
export const computerSecretsProviderSchema = z.literal('1password');

/** A 1Password service account token. Format check only; 1Password judges validity. */
export const onePasswordServiceAccountTokenSchema = z
    .string()
    .regex(/^ops_[A-Za-z0-9+/=_-]{20,4096}$/, 'Expected a 1Password service account token.');

/** 1Password's opaque ids for vaults and items. */
export const onePasswordIdSchema = z.string().regex(/^[a-z0-9]{8,64}$/);

/** The 1Password account sign-in address the desktop App used, such as `my.1password.com`. */
export const onePasswordAccountSchema = z
    .string()
    .trim()
    .regex(/^[a-z0-9.-]{1,253}$/i);

/** A vault as `op` reports it. Names with `:` or `,` cannot appear in a `--vault` grant. */
export const onePasswordVaultSchema = z
    .object({
        id: onePasswordIdSchema,
        name: z
            .string()
            .trim()
            .min(1)
            .max(200)
            .regex(/^[^:,\n]+$/),
    })
    .strict();

export type OnePasswordVault = z.infer<typeof onePasswordVaultSchema>;

/** The item field Haus injects: API Credential → `credential`, Password and Login → `password`. */
export const onePasswordItemFieldSchema = z.enum(['credential', 'password']);

/**
 * One vault item the desktop App listed for a Computer: its ids and title plus
 * the field to inject. Never a value; the Computer resolves values per command.
 */
export const onePasswordItemSchema = z
    .object({
        field: onePasswordItemFieldSchema,
        id: onePasswordIdSchema,
        title: z.string().trim().min(1).max(200),
    })
    .strict();

export type OnePasswordItem = z.infer<typeof onePasswordItemSchema>;

export const onePasswordItemListSchema = z.array(onePasswordItemSchema).max(200);

/** A service account name Haus creates; the Owner revokes it on 1password.com by this name. */
export const onePasswordServiceAccountNameSchema = z.string().trim().min(1).max(120);

/**
 * Why a connected vault cannot run commands yet; `null` when it can.
 * `keychain-locked`: the login Keychain holding the token is locked (it locks
 * itself after an idle timeout), so `haus-secrets` cannot read it until
 * someone logs in on the Computer.
 */
export const computerSecretsIssueSchema = z.enum(['keychain-locked', 'runtime-missing']);

export type ComputerSecretsIssue = z.infer<typeof computerSecretsIssueSchema>;

/** One vault item exposed to Agents as an environment variable name. */
export const computerSecretItemSchema = z
    .object({
        envName: z.string().regex(/^[A-Z_][A-Z0-9_]{0,127}$/),
        title: z.string().trim().min(1).max(200),
    })
    .strict();

export type ComputerSecretItem = z.infer<typeof computerSecretItemSchema>;

export const computerSecretsStatusSchema = z.discriminatedUnion('connected', [
    z.object({ connected: z.literal(false), provider: computerSecretsProviderSchema }).strict(),
    z
        .object({
            account: onePasswordAccountSchema,
            connected: z.literal(true),
            connectedAt: z.iso.datetime({ offset: true }),
            issue: computerSecretsIssueSchema.nullable(),
            items: z.array(computerSecretItemSchema).max(200),
            itemsRefreshedAt: z.iso.datetime({ offset: true }),
            provider: computerSecretsProviderSchema,
            serviceAccountName: onePasswordServiceAccountNameSchema,
            vault: onePasswordVaultSchema,
        })
        .strict(),
]);

export type ComputerSecretsStatus = z.infer<typeof computerSecretsStatusSchema>;

export const computerSecretsOperationSchema = z.discriminatedUnion('kind', [
    z
        .object({
            account: onePasswordAccountSchema,
            items: onePasswordItemListSchema,
            kind: z.literal('connect'),
            serviceAccountName: onePasswordServiceAccountNameSchema,
            token: onePasswordServiceAccountTokenSchema,
            vault: onePasswordVaultSchema,
        })
        .strict(),
    z
        .object({
            items: onePasswordItemListSchema,
            kind: z.literal('refresh-items'),
            vaultId: onePasswordIdSchema,
        })
        .strict(),
    z.object({ kind: z.literal('disconnect') }).strict(),
]);

export type ComputerSecretsOperation = z.infer<typeof computerSecretsOperationSchema>;

/** Server → Computer. A `connect` frame is the only place the token crosses a wire. */
export const computerSecretsRequestSchema = z
    .object({
        operation: computerSecretsOperationSchema,
        requestId: idSchema,
        traceContext: traceCarrierSchema.optional(),
        type: z.literal('computer-secrets-request'),
    })
    .strict();

export type ComputerSecretsRequest = z.infer<typeof computerSecretsRequestSchema>;

/** Computer → Server. Status only; the token never travels back. */
export const computerSecretsResultSchema = z
    .object({
        error: z.string().trim().min(1).max(500).optional(),
        requestId: idSchema,
        result: computerSecretsStatusSchema.optional(),
        type: z.literal('computer-secrets-result'),
    })
    .strict()
    .refine((value) => Boolean(value.error) !== Boolean(value.result));

export type ComputerSecretsResult = z.infer<typeof computerSecretsResultSchema>;
