import {
    workerBranchSchema,
    pullRequestReadingSchema,
    workerPullRequestSchema,
    workerReconcileEntrySchema,
    workerReportSchema,
    workerTurnModelParamSchema,
    workerTurnModelSchema,
    workerTurnSchema,
    workerTurnsRetained,
    workerUsageSchema,
    workerSchema,
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

const workerUsageResponseSchema = z.looseObject(workerUsageSchema.shape);

/** The full report `summary` is cut from (TECH-8); loosened like every other nested object here. */
const workerReportResponseSchema = z.looseObject(workerReportSchema.shape);

const workerTurnModelParamResponseSchema = z.looseObject(workerTurnModelParamSchema.shape);

const workerTurnModelResponseSchema = z.looseObject({
    ...workerTurnModelSchema.shape,
    params: z.array(workerTurnModelParamResponseSchema).max(2),
});

const workerTurnResponseSchema = z.looseObject({
    ...workerTurnSchema.shape,
    branches: z.array(workerBranchResponseSchema).max(50),
    model: workerTurnModelResponseSchema,
    // A Server older than this Computer sends no report.
    report: workerReportResponseSchema.nullable().default(null),
    usage: workerUsageResponseSchema.nullable(),
});

const workerCancelRequestedByResponseSchema = z.discriminatedUnion('kind', [
    z.looseObject({ id: z.string().trim().min(1), kind: z.literal('agent') }),
    z.looseObject({ id: z.string().trim().min(1), kind: z.literal('user') }),
]);

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
    cancelRequestedBy: workerCancelRequestedByResponseSchema.nullable(),
    job: workerJobResponseSchema,
    // A Server older than this Computer sends no reading.
    pullRequest: pullRequestReadingResponseSchema.nullable().default(null),
    turns: z.array(workerTurnResponseSchema).max(workerTurnsRetained),
});

export const workerReconcileEntryResponseSchema = z.looseObject(workerReconcileEntrySchema.shape);

/** `haus worker start`'s `started` branch; the held branch adds its own message schema. */
export const agentWorkerReceiptResponseSchema = z.looseObject({
    chatId: z.string().trim().min(1),
    idempotent: z.boolean(),
    messageId: z.string().trim().min(1),
    turnId: z.string().trim().min(1),
    sequence: z.number().int().positive(),
    state: z.literal('started'),
    target: z.string().trim().min(1),
    worker: workerResponseSchema,
});

export const agentWorkerSendReceiptResponseSchema = z.looseObject({
    idempotent: z.boolean(),
    predecessors: z.array(workerReconcileEntryResponseSchema),
    turnId: z.string().trim().min(1),
    worker: workerResponseSchema,
});

export const agentWorkerListReceiptResponseSchema = z.looseObject({
    workers: z.array(workerResponseSchema),
});

export const agentWorkerCancelReceiptResponseSchema = z.looseObject({
    worker: workerResponseSchema,
});
