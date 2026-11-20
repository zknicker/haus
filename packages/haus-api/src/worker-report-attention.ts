import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { taskKeySchema } from './task-key.ts';
import { workerOutcomeSchema, workerPlaceSchema } from './worker-outcome.ts';
import { pullRequestReadingSchema } from './worker-pull-request.ts';
import { workerTitleSchema } from './worker-shared.ts';

export const workerReportsPerRun = 20;

/**
 * One settled Worker turn for its delegating Agent (specs/inbox.md "Worker
 * items"): the report, or the failure Haus recorded. It names only people,
 * revisions, and readings the Server holds.
 */
export const workerReportAttentionSchema = z
    .object({
        citedFiles: z
            .array(
                z
                    .object({
                        path: z.string().trim().min(1).max(1024),
                        revisionId: idSchema,
                    })
                    .strict()
            )
            .max(50),
        outcome: workerOutcomeSchema,
        person: z
            .object({ handle: z.string().trim().min(1).max(128), id: idSchema })
            .strict()
            .nullable(),
        place: workerPlaceSchema,
        pullRequests: z.array(pullRequestReadingSchema).max(50),
        taskKey: taskKeySchema,
        title: workerTitleSchema,
        turnId: idSchema,
        turnNumber: z.number().int().positive(),
        workerId: idSchema,
    })
    .strict();
export type WorkerReportAttention = z.infer<typeof workerReportAttentionSchema>;

/** What a busy Agent hears: a count of one Task's queued reports. */
export const workerReportsNoticeSchema = z
    .object({
        ids: z.array(idSchema).min(1).max(workerReportsPerRun),
        taskKey: taskKeySchema,
        total: z.number().int().positive(),
    })
    .strict()
    .refine((notice) => notice.total >= notice.ids.length, {
        message: 'The total counts every queued report.',
        path: ['total'],
    });
export type WorkerReportsNotice = z.infer<typeof workerReportsNoticeSchema>;
