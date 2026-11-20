import {
    pullRequestReadingSchema,
    workerBranchSchema,
    workerOutcomeSchema,
    workerProviderResultSchema,
    workerPullRequestSchema,
    workerReconcileEntrySchema,
    workerReportSchema,
    workerSchema,
    workerStopRequestedBySchema,
    workerTurnInputSchema,
    workerTurnModelParamSchema,
    workerTurnModelSchema,
    workerTurnSchema,
    workerTurnsRetained,
    workerUsageSchema,
} from '@haus/api';
import * as z from 'zod';

const timestampSchema = z.iso.datetime({ offset: true });

/**
 * Parses the same shapes as `@haus/api`'s `.strict()` Worker
 * schemas, loosened at every nested object so an older Computer tolerates a
 * field a newer Server added instead of rejecting the whole response. Those
 * canonical schemas stay strict for the Server's own construction and for
 * validating untrusted request input; only response parsing needs this
 * tolerance.
 */

const workerPullRequestResponseSchema = z.looseObject(workerPullRequestSchema.shape);

const pullRequestReadingResponseSchema = z.looseObject(pullRequestReadingSchema.shape);

export const workerBranchResponseSchema = z.looseObject({
    ...workerBranchSchema.shape,
    pullRequest: workerPullRequestResponseSchema.nullable().optional(),
});

const [reportOutcome, stoppedOutcome, failedOutcome] = workerOutcomeSchema.options;

export const workerOutcomeResponseSchema = z.discriminatedUnion('kind', [
    z.looseObject({ ...reportOutcome.shape, report: z.looseObject(workerReportSchema.shape) }),
    z.looseObject(stoppedOutcome.shape),
    z.looseObject(failedOutcome.shape),
]);

const workerUsageResponseSchema = z.looseObject(workerUsageSchema.shape);

const workerProviderResultResponseSchema = z.looseObject(workerProviderResultSchema.shape);

const workerTurnModelParamResponseSchema = z.looseObject(workerTurnModelParamSchema.shape);

export const workerTurnModelResponseSchema = z.looseObject({
    ...workerTurnModelSchema.shape,
    params: z.array(workerTurnModelParamResponseSchema).max(2),
});

const [agentStopper, userStopper] = workerStopRequestedBySchema.options;

const workerTurnInputResponseSchema = z.looseObject({
    ...workerTurnInputSchema.shape,
    author: z.looseObject(workerTurnInputSchema.shape.author.shape),
});

const workerTurnResponseSchema = z.looseObject({
    ...workerTurnSchema.shape,
    branches: z.array(workerBranchResponseSchema).max(50),
    input: z.array(workerTurnInputResponseSchema).nullable(),
    model: workerTurnModelResponseSchema,
    outcome: workerOutcomeResponseSchema.nullable(),
    report: workerProviderResultResponseSchema.nullable(),
    stopRequestedBy: z
        .discriminatedUnion('kind', [
            z.looseObject(agentStopper.shape),
            z.looseObject(userStopper.shape),
        ])
        .nullable(),
    usage: workerUsageResponseSchema.nullable(),
});

const workerActivityResponseSchema = z.looseObject({
    at: timestampSchema,
    summary: z.string().trim().min(1).max(120),
});

const workerFollowUpResponseSchema = z.discriminatedUnion('state', [
    z.looseObject({ since: timestampSchema, state: z.literal('waiting') }),
    z.looseObject({ since: timestampSchema, state: z.literal('running') }),
    z.looseObject({ since: timestampSchema, state: z.literal('stalled') }),
]);

const workerJobResponseSchema = z.discriminatedUnion('state', [
    z.looseObject({
        followUp: workerFollowUpResponseSchema.nullable(),
        startedAt: timestampSchema.nullable(),
        state: z.literal('working'),
    }),
    z.looseObject({
        followUp: workerFollowUpResponseSchema.nullable(),
        settledAt: timestampSchema.nullable(),
        startedAt: timestampSchema.nullable(),
        state: z.literal('done'),
    }),
    z.looseObject({
        errorCode: z.string().trim().min(1).max(120).nullable(),
        followUp: workerFollowUpResponseSchema.nullable(),
        settledAt: timestampSchema.nullable(),
        state: z.literal('failed'),
        summary: z.string().trim().min(1).max(2000).nullable(),
    }),
    z.looseObject({
        followUp: workerFollowUpResponseSchema.nullable(),
        question: z.string().trim().min(1).max(2000).nullable(),
        settledAt: timestampSchema.nullable(),
        startedAt: timestampSchema.nullable(),
        state: z.literal('pending-input'),
    }),
    z.looseObject({
        followUp: workerFollowUpResponseSchema.nullable(),
        settledAt: timestampSchema.nullable(),
        state: z.literal('cancelled'),
    }),
    z.looseObject({
        followUp: workerFollowUpResponseSchema.nullable(),
        settledAt: timestampSchema.nullable(),
        state: z.literal('expired'),
    }),
]);

export const workerResponseSchema = z.looseObject({
    ...workerSchema.shape,
    activity: workerActivityResponseSchema.nullable(),
    job: workerJobResponseSchema,
    pullRequest: pullRequestReadingResponseSchema.nullable(),
    turns: z.array(workerTurnResponseSchema).max(workerTurnsRetained),
});

export const workerReconcileEntryResponseSchema = z.looseObject(workerReconcileEntrySchema.shape);

/** `haus worker start`'s recorded branch; the held branch adds its own message schema. */
export const agentWorkerReceiptResponseSchema = z.looseObject({
    state: z.enum(['started', 'queued']),
    worker: workerResponseSchema,
});

export const agentWorkerSendReceiptResponseSchema = z.looseObject({
    idempotent: z.boolean(),
    turnId: z.string().trim().min(1),
    worker: workerResponseSchema,
});

export const agentWorkerListReceiptResponseSchema = z.looseObject({
    workers: z.array(workerResponseSchema),
});

export const agentWorkerStopReceiptResponseSchema = z.looseObject({
    worker: workerResponseSchema,
});
