import * as z from 'zod';
import { cloudAgentProviderSchema } from './cloud-agent-provider.ts';

export const cloudAgentComputerSettingsSchema = z
    .object({
        defaultProvider: cloudAgentProviderSchema,
        claudeEnvironmentId: z.string().trim().min(1).max(200).nullable(),
    })
    .strict();
export const cloudAgentComputerSettingsPatchSchema = cloudAgentComputerSettingsSchema
    .partial()
    .refine((value) => Object.keys(value).length > 0);
export type CloudAgentComputerSettings = z.infer<typeof cloudAgentComputerSettingsSchema>;
