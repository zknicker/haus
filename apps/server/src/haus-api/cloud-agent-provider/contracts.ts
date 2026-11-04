import { cloudAgentCapabilityStateSchema, cloudAgentProviderSchema } from '@haus/api';
import { z } from 'zod';
import { computerIdSchema } from '../../computers/contracts.ts';
import { serverIdSchema } from '../../servers/contracts.ts';

const cloudAgentProviderTargetSchema = z
    .object({
        computerId: computerIdSchema,
        provider: cloudAgentProviderSchema.default('cursor'),
        serverId: serverIdSchema,
    })
    .strict();

export const cloudAgentProviderGetInputSchema = cloudAgentProviderTargetSchema;
export const cloudAgentProviderActionInputSchema = cloudAgentProviderTargetSchema;
export const cloudAgentProviderSetEnvironmentInputSchema = cloudAgentProviderTargetSchema.extend({
    environmentId: z.string().trim().min(1).max(200).nullable(),
});
export const cloudAgentProviderOutputSchema = cloudAgentCapabilityStateSchema;
