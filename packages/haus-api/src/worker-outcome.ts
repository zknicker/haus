import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import type { WorkerTurnStatus } from './worker-shared.ts';

export const workerStatuses = [
    'queued',
    'working',
    'done',
    'needs-you',
    'failed',
    'stopped',
] as const;
export const workerStatusSchema = z.enum(workerStatuses);
export type WorkerStatus = z.infer<typeof workerStatusSchema>;

export const workerTurnInputTextMaxLength = 32_000;
export const workerReportTextMaxLength = 8000;

export const workerTurnInputSchema = z
    .object({
        at: z.iso.datetime({ offset: true }),
        author: z.object({ id: idSchema, kind: z.enum(['agent', 'user']) }).strict(),
        kind: z.enum(['brief', 'follow-up']),
        messageId: idSchema.nullable(),
        text: z.string().min(1).max(workerTurnInputTextMaxLength),
    })
    .strict();
export type WorkerTurnInput = z.infer<typeof workerTurnInputSchema>;

export const workerReportOutcomes = ['done', 'needs-you', 'failed'] as const;
export const workerReportOutcomeSchema = z.enum(workerReportOutcomes);
export type WorkerReportOutcome = z.infer<typeof workerReportOutcomeSchema>;

/**
 * One turn's report. `messageId` is the Task Message the report posted; it is
 * null only on reports migrated from before Workers, which posted none.
 */
export const workerReportSchema = z
    .object({
        ask: z.string().max(workerReportTextMaxLength).nullable(),
        messageId: idSchema.nullable(),
        outcome: workerReportOutcomeSchema,
        personId: idSchema.nullable(),
        personRefused: z.string().trim().min(1).max(128).nullable(),
        pullRequestUrls: z.array(z.url().max(2000)).max(50),
        source: z.enum(['worker', 'provider']),
        text: z.string().max(workerReportTextMaxLength),
    })
    .strict();
export type WorkerReport = z.infer<typeof workerReportSchema>;

export const workerFailures = [
    'no-report',
    'machine-offline',
    'machine-removed',
    'place-off',
    'launch-refused',
    'harness-error',
    'provider-error',
    'provider-expired',
] as const;
export const workerFailureSchema = z.enum(workerFailures);
export type WorkerFailure = z.infer<typeof workerFailureSchema>;

export const workerOutcomeSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('report'), report: workerReportSchema }).strict(),
    z.object({ kind: z.literal('stopped') }).strict(),
    z
        .object({
            detail: z.string().max(500).nullable(),
            kind: z.literal('failed'),
            reason: workerFailureSchema,
        })
        .strict(),
]);
export type WorkerOutcome = z.infer<typeof workerOutcomeSchema>;

/**
 * The provider's final answer as the carrier read it: the result text with its
 * `Haus-Outcome` and `Haus-Person` lines removed, and what those lines said.
 */
export const workerObservedResultSchema = z
    .object({
        outcome: workerReportOutcomeSchema.nullable(),
        personHandle: z.string().trim().min(1).max(128).nullable(),
        pullRequestUrls: z.array(z.url().max(2000)).max(50),
        text: z.string().max(65_536),
    })
    .strict();
export type WorkerObservedResult = z.infer<typeof workerObservedResultSchema>;

type SettledTurnStatus = Exclude<WorkerTurnStatus, 'queued' | 'running'>;

export interface WorkerOutcomeInput {
    errorCode: string | null;
    messageId: string | null;
    /** The Server's answer to the result's `Haus-Person` line. */
    person: { personId: string | null; personRefused: string | null };
    result: WorkerObservedResult | null;
    status: SettledTurnStatus;
}

/** The carrier's `errorCode` for a turn it never journaled, so it never reached the provider. */
export const workerNotJournaledErrorCode = 'turn-not-journaled';

/**
 * The carrier's `errorCode`s for a turn the provider definitely refused or never
 * received; each settles `launch-refused` (specs/cloud-agents.md "Follow-up delivery").
 */
export const workerLaunchRefusedErrorCodes = [
    'provider-launch-rejected',
    'followup-delivery-rejected',
    'launch-timeout',
    workerNotJournaledErrorCode,
] as const;
export type WorkerLaunchRefusedErrorCode = (typeof workerLaunchRefusedErrorCodes)[number];

const launchRefused = new Set<string>(workerLaunchRefusedErrorCodes);

const outcomeByStatus: Record<SettledTurnStatus, (input: WorkerOutcomeInput) => WorkerOutcome> = {
    cancelled: () => ({ kind: 'stopped' }),
    completed: (input) =>
        input.result?.text
            ? report(input, input.result.outcome ?? 'done')
            : failed('no-report', input.errorCode),
    expired: (input) => failed('provider-expired', input.errorCode),
    failed: (input) => {
        if (input.result?.text) {
            return report(input, 'failed');
        }
        return input.errorCode && launchRefused.has(input.errorCode)
            ? failed('launch-refused', input.errorCode)
            : failed('provider-error', input.errorCode);
    },
    pending_input: (input) => report({ ...input, person: noPerson }, 'needs-you'),
};

/** Maps a settled provider turn to its outcome (specs/cloud-agents.md "Reports from the provider"). */
export function workerOutcomeOf(input: WorkerOutcomeInput) {
    return outcomeByStatus[input.status](input);
}

/**
 * A Worker's status, projected from its newest turn (specs/workers.md "Record").
 * The outcome wins over the provider status: a turn Haus stopped while its
 * carrier was offline is settled before the provider says so.
 */
export function workerStatusOf(newest: {
    outcome: WorkerOutcome | null;
    status: WorkerTurnStatus;
}) {
    if (newest.outcome === null) {
        return statusBeforeOutcome[newest.status];
    }
    return newest.outcome.kind === 'report'
        ? newest.outcome.report.outcome
        : newest.outcome.kind === 'stopped'
          ? 'stopped'
          : 'failed';
}

const statusBeforeOutcome: Record<WorkerTurnStatus, WorkerStatus> = {
    cancelled: 'stopped',
    completed: 'done',
    expired: 'failed',
    failed: 'failed',
    pending_input: 'needs-you',
    queued: 'queued',
    running: 'working',
};

export function isLiveWorkerStatus(status: WorkerStatus) {
    return status === 'queued' || status === 'working';
}

const noPerson = { personId: null, personRefused: null };

function report(input: WorkerOutcomeInput, outcome: WorkerReportOutcome) {
    const text = (input.result?.text ?? '').slice(0, workerReportTextMaxLength);
    const person = outcome === 'needs-you' ? input.person : noPerson;
    return {
        kind: 'report',
        report: {
            ask: outcome === 'needs-you' ? text : null,
            messageId: input.messageId,
            outcome,
            personId: person.personId,
            personRefused: person.personRefused,
            pullRequestUrls: input.result?.pullRequestUrls ?? [],
            source: 'provider',
            text,
        },
    } satisfies WorkerOutcome;
}

function failed(reason: WorkerFailure, detail: string | null) {
    return { detail, kind: 'failed', reason } satisfies WorkerOutcome;
}
