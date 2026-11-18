import { cloudAgentPullRequestChangeSchema, cloudAgentWorkAttentionSchema } from '@haus/api';
import * as z from 'zod';
import { cloudAgentBranchResponseSchema } from './agent-cli/cloud-agent-work-response-schema.ts';

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` typed inbox attentions
 * (a settled Cloud Agent Run's terminal attention, or a Task's pull request
 * notice), loosened at every nested object so an older Computer tolerates
 * a field a newer Server added instead of dropping the whole inbox item.
 */

/**
 * A pull request change: on a Run's `pull_request` attention, or alone as the
 * `pullRequestNotice` for a Task no cloud work reports to (ADR 0053 decision 6).
 */
export const pullRequestChangeResponseSchema = z.looseObject(
    cloudAgentPullRequestChangeSchema.shape
);

export const cloudAgentWorkAttentionResponseSchema = z.looseObject({
    ...cloudAgentWorkAttentionSchema.shape,
    branches: z.array(cloudAgentBranchResponseSchema).max(50),
    pullRequestChange: pullRequestChangeResponseSchema.optional(),
});
