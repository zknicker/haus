import {
    cloudAgentBranchSchema,
    cloudAgentPullRequestReadingSchema,
    cloudAgentPullRequestSchema,
    cloudAgentReconcileEntrySchema,
    cloudAgentRunModelParamSchema,
    cloudAgentRunModelSchema,
    cloudAgentRunSchema,
    cloudAgentRunsRetained,
    cloudAgentUsageSchema,
    cloudAgentWorkSchema,
} from '@haus/api';
import * as z from 'zod';

const timestampSchema = z.iso.datetime({ offset: true });

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` Cloud Agent work
 * schemas, loosened at every nested object so an older Computer tolerates a
 * field a newer Server added instead of rejecting the whole response. Those
 * canonical schemas stay strict for the Server's own construction and for
 * validating untrusted request input; only response parsing needs this
 * tolerance.
 */

const cloudAgentPullRequestResponseSchema = z.looseObject(cloudAgentPullRequestSchema.shape);

const cloudAgentPullRequestReadingResponseSchema = z.looseObject(
    cloudAgentPullRequestReadingSchema.shape
);

const cloudAgentBranchResponseSchema = z.looseObject({
    ...cloudAgentBranchSchema.shape,
    pullRequest: cloudAgentPullRequestResponseSchema.nullable().optional(),
});

const cloudAgentUsageResponseSchema = z.looseObject(cloudAgentUsageSchema.shape);

const cloudAgentRunModelParamResponseSchema = z.looseObject(cloudAgentRunModelParamSchema.shape);

const cloudAgentRunModelResponseSchema = z.looseObject({
    ...cloudAgentRunModelSchema.shape,
    params: z.array(cloudAgentRunModelParamResponseSchema).max(2),
});

const cloudAgentRunResponseSchema = z.looseObject({
    ...cloudAgentRunSchema.shape,
    branches: z.array(cloudAgentBranchResponseSchema).max(50),
    model: cloudAgentRunModelResponseSchema,
    usage: cloudAgentUsageResponseSchema.nullable(),
});

const cloudAgentCancelRequestedByResponseSchema = z.discriminatedUnion('kind', [
    z.looseObject({ id: z.string().trim().min(1), kind: z.literal('agent') }),
    z.looseObject({ id: z.string().trim().min(1), kind: z.literal('user') }),
]);

const cloudAgentActivityResponseSchema = z.looseObject({
    at: timestampSchema,
    summary: z.string().trim().min(1).max(120),
});

const cloudAgentFollowUpResponseSchema = z.discriminatedUnion('state', [
    z.looseObject({ since: timestampSchema, state: z.literal('waiting') }),
    z.looseObject({ since: timestampSchema, state: z.literal('running') }),
    z.looseObject({ since: timestampSchema, state: z.literal('stalled') }),
]);

const cloudAgentJobResponseSchema = z.discriminatedUnion('state', [
    z.looseObject({
        followUp: cloudAgentFollowUpResponseSchema.nullable(),
        startedAt: timestampSchema.nullable(),
        state: z.literal('working'),
    }),
    z.looseObject({
        followUp: cloudAgentFollowUpResponseSchema.nullable(),
        settledAt: timestampSchema.nullable(),
        startedAt: timestampSchema.nullable(),
        state: z.literal('done'),
    }),
    z.looseObject({
        errorCode: z.string().trim().min(1).max(120).nullable(),
        followUp: cloudAgentFollowUpResponseSchema.nullable(),
        settledAt: timestampSchema.nullable(),
        state: z.literal('failed'),
        summary: z.string().trim().min(1).max(2000).nullable(),
    }),
    z.looseObject({
        followUp: cloudAgentFollowUpResponseSchema.nullable(),
        question: z.string().trim().min(1).max(2000).nullable(),
        settledAt: timestampSchema.nullable(),
        startedAt: timestampSchema.nullable(),
        state: z.literal('pending-input'),
    }),
    z.looseObject({
        followUp: cloudAgentFollowUpResponseSchema.nullable(),
        settledAt: timestampSchema.nullable(),
        state: z.literal('cancelled'),
    }),
    z.looseObject({
        followUp: cloudAgentFollowUpResponseSchema.nullable(),
        settledAt: timestampSchema.nullable(),
        state: z.literal('expired'),
    }),
]);

export const cloudAgentWorkResponseSchema = z.looseObject({
    ...cloudAgentWorkSchema.shape,
    activity: cloudAgentActivityResponseSchema.nullable(),
    cancelRequestedBy: cloudAgentCancelRequestedByResponseSchema.nullable(),
    job: cloudAgentJobResponseSchema,
    // A Server older than this Computer sends no reading.
    pullRequest: cloudAgentPullRequestReadingResponseSchema.nullable().default(null),
    runs: z.array(cloudAgentRunResponseSchema).max(cloudAgentRunsRetained),
});

export const cloudAgentReconcileEntryResponseSchema = z.looseObject(
    cloudAgentReconcileEntrySchema.shape
);

/** `haus cloud-agent start`'s `started` branch; the held branch adds its own message schema. */
export const agentCloudAgentReceiptResponseSchema = z.looseObject({
    chatId: z.string().trim().min(1),
    idempotent: z.boolean(),
    messageId: z.string().trim().min(1),
    runId: z.string().trim().min(1),
    sequence: z.number().int().positive(),
    state: z.literal('started'),
    target: z.string().trim().min(1),
    work: cloudAgentWorkResponseSchema,
});

export const agentCloudAgentSendReceiptResponseSchema = z.looseObject({
    idempotent: z.boolean(),
    predecessors: z.array(cloudAgentReconcileEntryResponseSchema),
    runId: z.string().trim().min(1),
    work: cloudAgentWorkResponseSchema,
});

export const agentCloudAgentListReceiptResponseSchema = z.looseObject({
    works: z.array(cloudAgentWorkResponseSchema),
});

export const agentCloudAgentCancelReceiptResponseSchema = z.looseObject({
    work: cloudAgentWorkResponseSchema,
});
