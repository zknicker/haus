import {
    agentThreadContextMessageSchema,
    agentThreadContextSchema,
    cloudAgentWorkAttentionSchema,
} from '@haus/api';
import * as z from 'zod';
import { cloudAgentBranchResponseSchema } from './agent-cli/cloud-agent-work-response-schema.ts';

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` typed inbox attentions
 * (a Thread-join context package, or a settled Cloud Agent Run's terminal
 * attention), loosened at every nested object so an older Computer tolerates
 * a field a newer Server added instead of dropping the whole inbox item.
 */

const agentThreadContextMessageResponseSchema = z.looseObject(
    agentThreadContextMessageSchema.shape
);

export const agentThreadContextResponseSchema = z.looseObject({
    ...agentThreadContextSchema.shape,
    parentMessage: agentThreadContextMessageResponseSchema,
    recentMessages: z.array(agentThreadContextMessageResponseSchema).max(10),
});

export const cloudAgentWorkAttentionResponseSchema = z.looseObject({
    ...cloudAgentWorkAttentionSchema.shape,
    branches: z.array(cloudAgentBranchResponseSchema).max(50),
});
