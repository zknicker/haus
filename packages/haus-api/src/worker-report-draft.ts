import * as z from 'zod';
import {
    workerReportOutcomeSchema,
    workerReportSchema,
    workerReportTextMaxLength,
} from './worker-outcome.ts';

const askMatchesOutcome = (report: { ask: string | null; outcome: string }) =>
    (report.outcome === 'needs-you') === (report.ask !== null);

/**
 * The report a Computer-place turn recorded with `haus worker report`, kept on
 * the turn until it settles. Settlement adds `source: 'worker'` and the
 * Message it posts.
 */
export const workerReportDraftSchema = workerReportSchema
    .omit({ messageId: true, personRefused: true, source: true })
    .refine(askMatchesOutcome, 'A needs-you report carries an ask, and only it does.');
export type WorkerReportDraft = z.infer<typeof workerReportDraftSchema>;

/**
 * `POST /api/worker/report`, authorized by the turn credential. `person` is a
 * handle the Server resolves to a human member who can read the Task. Calling
 * it again in the same turn replaces the draft.
 */
export const workerReportInputSchema = z
    .object({
        ask: z.string().trim().min(1).max(workerReportTextMaxLength).nullable().default(null),
        outcome: workerReportOutcomeSchema,
        person: z.string().trim().min(1).max(128).nullable().default(null),
        pullRequestUrls: z.array(z.url().max(2000)).max(50).default([]),
        text: z.string().trim().min(1).max(workerReportTextMaxLength),
    })
    .strict()
    .refine(askMatchesOutcome, 'A needs-you report carries an ask, and only it does.');
export type WorkerReportInput = z.infer<typeof workerReportInputSchema>;

/** The draft the Server recorded, echoed so the Worker sees what will post. */
export const workerReportReceiptSchema = z
    .object({ draft: workerReportDraftSchema, turnId: z.string().trim().min(1) })
    .strict();
export type WorkerReportReceipt = z.infer<typeof workerReportReceiptSchema>;
