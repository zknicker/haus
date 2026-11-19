import { workerPullRequestChangeSchema, workerAttentionSchema } from '@haus/api';
import * as z from 'zod';
import { workerBranchResponseSchema } from './agent-cli/worker-response-schema.ts';

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` typed inbox attentions
 * (a settled Worker Run's terminal attention, or a Task's pull request
 * notice), loosened at every nested object so an older Computer tolerates
 * a field a newer Server added instead of dropping the whole inbox item.
 */

export const pullRequestChangeResponseSchema = z.looseObject(workerPullRequestChangeSchema.shape);

export const workerAttentionResponseSchema = z.looseObject({
    ...workerAttentionSchema.shape,
    branches: z.array(workerBranchResponseSchema).max(50),
    pullRequestChange: pullRequestChangeResponseSchema.optional(),
});
