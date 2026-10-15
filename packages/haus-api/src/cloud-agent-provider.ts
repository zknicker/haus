import * as z from 'zod';

/**
 * The hosts a Cloud Agent can run on. Each Computer connects them separately
 * and names one as its default; an Agent may pick one per work.
 */
export const cloudAgentProviders = ['cursor', 'claude'] as const;

export const cloudAgentProviderSchema = z.enum(cloudAgentProviders);

export type CloudAgentProvider = z.infer<typeof cloudAgentProviderSchema>;
