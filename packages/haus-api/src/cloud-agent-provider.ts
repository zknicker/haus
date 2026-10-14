import * as z from 'zod';

export const cloudAgentProviders = ['cursor', 'claude'] as const;
export const cloudAgentProviderSchema = z.enum(cloudAgentProviders);
