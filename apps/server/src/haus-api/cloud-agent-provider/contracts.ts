import {
    cloudAgentCapabilityStateSchema,
    cloudAgentComputerSettingsPatchSchema,
    cloudAgentProviderSchema,
} from '@haus/api';
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
export const cloudAgentProviderOutputSchema = cloudAgentCapabilityStateSchema;

export const cloudAgentProviderConfigureInputSchema = cloudAgentProviderTargetSchema.extend({
    settings: cloudAgentComputerSettingsPatchSchema,
});
