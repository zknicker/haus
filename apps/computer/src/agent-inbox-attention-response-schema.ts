import { workerBranchResponseSchema, workerOutcomeResponseSchema } from '@haus/agent-cli';
import {
    pullRequestReadingSchema,
    workerAttentionSchema,
    workerPullRequestChangeSchema,
    workerReportAttentionSchema,
} from '@haus/api';
import * as z from 'zod';

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` typed inbox attentions
 * (a Worker report, a Worker stall or pull request change, or a Task's pull
 * request notice), loosened at every nested object so an older Computer
 * tolerates a field a newer Server added instead of dropping the whole inbox item.
 */

export const pullRequestChangeResponseSchema = z.looseObject(workerPullRequestChangeSchema.shape);

export const workerAttentionResponseSchema = z.looseObject({
    ...workerAttentionSchema.shape,
    branches: z.array(workerBranchResponseSchema).max(50),
    pullRequestChange: pullRequestChangeResponseSchema.optional(),
});

const { citedFiles, person } = workerReportAttentionSchema.shape;

export const workerReportAttentionResponseSchema = z.looseObject({
    ...workerReportAttentionSchema.shape,
    citedFiles: z.array(z.looseObject(citedFiles.element.shape)).max(50),
    outcome: workerOutcomeResponseSchema,
    person: z.looseObject(person.unwrap().shape).nullable(),
    pullRequests: z.array(z.looseObject(pullRequestReadingSchema.shape)).max(50),
});
