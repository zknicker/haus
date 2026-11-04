import * as z from 'zod';
import { cloudAgentEnvironmentSchema } from './cloud-agent-environment.ts';
import { cloudAgentProviderSchema } from './cloud-agent-provider.ts';
import { cloudAgentTimestampSchema, cloudAgentUnreadyReasonSchema } from './cloud-agent-shared.ts';

/**
 * One Cloud Agent provider capability on one Computer: whether its credential
 * store currently resolves, and the account it resolves to. It carries no
 * credential — Haus never copies a provider key into Server.
 */
export const cloudAgentCapabilityStateSchema = z
    .object({
        /** The provider account the resolved credential belongs to, when it names one. */
        accountEmail: z.string().trim().min(1).max(320).nullable(),
        /** The Computer's pinned Claude cloud environment id; null is "not pinned". Claude only. */
        environmentId: z.string().trim().min(1).max(200).nullable().optional(),
        /** This Computer's Claude cloud environments to pin to; null off Claude. */
        environments: z.array(cloudAgentEnvironmentSchema).max(200).nullable().optional(),
        /** When the resolved credential expires, when the provider dates it. */
        expiresAt: cloudAgentTimestampSchema.nullable(),
        /** Whether a launch that names no provider uses this one on this Computer. */
        isDefault: z.boolean().default(false),
        provider: cloudAgentProviderSchema,
        ready: z.boolean(),
        reason: cloudAgentUnreadyReasonSchema.nullable(),
        signIn: z
            .discriminatedUnion('status', [
                z
                    .object({
                        status: z.literal('waiting'),
                        url: z
                            .url()
                            .max(4096)
                            .refine((value) => {
                                if (!URL.canParse(value)) {
                                    return false;
                                }
                                const url = new URL(value);
                                return (
                                    url.protocol === 'https:' &&
                                    url.hostname === 'cursor.com' &&
                                    !url.username &&
                                    !url.password &&
                                    !url.port
                                );
                            }),
                        expiresAt: cloudAgentTimestampSchema,
                    })
                    .strict(),
                z
                    .object({ status: z.literal('failed'), message: z.string().min(1).max(500) })
                    .strict(),
            ])
            .optional(),
    })
    .strict()
    .refine((value) => value.ready !== Boolean(value.reason), {
        message: 'A ready capability carries no reason, and an unready one must name its reason.',
        path: ['reason'],
    });

export type CloudAgentCapabilityState = z.infer<typeof cloudAgentCapabilityStateSchema>;
