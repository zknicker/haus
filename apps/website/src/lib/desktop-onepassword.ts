import {
    onePasswordAccountSchema,
    onePasswordItemListSchema,
    onePasswordServiceAccountNameSchema,
    onePasswordServiceAccountTokenSchema,
    onePasswordVaultSchema,
} from '@haus/api';
import { z } from 'zod';

/** Why desktop main could not talk to 1Password; `message` is ready to show. */
const unavailableSchema = z.object({
    message: z.string(),
    reason: z.string(),
    status: z.literal('unavailable'),
});

const vaultsReplySchema = z.discriminatedUnion('status', [
    z.object({
        account: onePasswordAccountSchema,
        status: z.literal('ok'),
        vaults: z.array(onePasswordVaultSchema),
    }),
    unavailableSchema,
]);

const itemsReplySchema = z.discriminatedUnion('status', [
    z.object({ items: onePasswordItemListSchema, status: z.literal('ok') }),
    unavailableSchema,
]);

const connectReplySchema = z.discriminatedUnion('status', [
    z.object({
        items: onePasswordItemListSchema,
        serviceAccountName: onePasswordServiceAccountNameSchema,
        status: z.literal('ok'),
        token: onePasswordServiceAccountTokenSchema,
    }),
    unavailableSchema,
]);

export type OnePasswordVaultsReply = z.infer<typeof vaultsReplySchema>;
export type OnePasswordItemsReply = z.infer<typeof itemsReplySchema>;
export type OnePasswordConnectReply = z.infer<typeof connectReplySchema>;

const malformed = {
    message: 'The desktop app returned an unexpected 1Password reply.',
    reason: 'malformed',
    status: 'unavailable',
} as const;

export function parseOnePasswordVaultsReply(value: unknown): OnePasswordVaultsReply {
    const parsed = vaultsReplySchema.safeParse(value);
    return parsed.success ? parsed.data : malformed;
}

export function parseOnePasswordItemsReply(value: unknown): OnePasswordItemsReply {
    const parsed = itemsReplySchema.safeParse(value);
    return parsed.success ? parsed.data : malformed;
}

export function parseOnePasswordConnectReply(value: unknown): OnePasswordConnectReply {
    const parsed = connectReplySchema.safeParse(value);
    return parsed.success ? parsed.data : malformed;
}
