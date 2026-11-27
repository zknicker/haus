import * as z from 'zod';
import { idSchema } from './chat-contract-primitives.ts';
import { issueCodeSchema } from './issue.ts';
import { taskDeliveryModeSchema } from './task-delivery.ts';
import { taskShortIdSchema } from './task-short-id.ts';
import { taskTitleSchema } from './task.ts';
import { pullRequestReadingSchema } from './pull-request.ts';

/** Most crew reports one Captain run or busy notice carries; the rest wait for the next run. */
export const crewReportBatchLimit = 50;

/** The text budget of one crew report run: reports past it wait for the next run. */
export const crewReportBatchTextBudget = 24_000;

/** Longest report text a Task posts with `haus task report`. */
export const crewReportTextMaxLength = 8000;

export const taskReportOutcomes = ['done', 'needs-you', 'failed'] as const;
export const taskReportOutcomeSchema = z.enum(taskReportOutcomes);
export type TaskReportOutcome = z.infer<typeof taskReportOutcomeSchema>;

/** A report's outcome, or `unreported` when a Captain-directed turn ended without one. */
export const crewReportOutcomeSchema = z.enum([...taskReportOutcomes, 'unreported']);
export type CrewReportOutcome = z.infer<typeof crewReportOutcomeSchema>;

/** One Issue edit the Task made in the reported turn, already worded for the Captain. */
export const crewReportIssueEditSchema = z
    .object({ change: z.string().min(1).max(300), code: issueCodeSchema })
    .strict();

/**
 * One crew Task turn for its Captain (specs/inbox.md#crew-reports). `id` is its inbox identity,
 * `crew-report:<taskId>:<runId>`. `text` is the report, or for `unreported` the Task's last
 * message. It names only people and readings the Server holds.
 */
export const crewReportAttentionSchema = z
    .object({
        ask: z.string().max(crewReportTextMaxLength).nullable(),
        id: idSchema,
        issueCodes: z.array(issueCodeSchema).max(20),
        issueEdits: z.array(crewReportIssueEditSchema).max(50),
        outcome: crewReportOutcomeSchema,
        person: z
            .object({ handle: z.string().trim().min(1).max(128), id: idSchema })
            .strict()
            .nullable(),
        pullRequests: z.array(pullRequestReadingSchema).max(20),
        taskShortId: taskShortIdSchema,
        text: z.string().max(crewReportTextMaxLength),
        title: taskTitleSchema,
    })
    .strict();

export type CrewReportAttention = z.infer<typeof crewReportAttentionSchema>;

export const crewReportsSchema = z
    .array(crewReportAttentionSchema)
    .min(1)
    .max(crewReportBatchLimit);

/** What a busy Captain hears: a count of its crew's queued reports. */
export const crewReportsNoticeSchema = z
    .object({
        ids: z.array(idSchema).min(1).max(crewReportBatchLimit),
        total: z.number().int().positive(),
    })
    .strict();

export type CrewReportsNotice = z.infer<typeof crewReportsNoticeSchema>;

/** `POST /api/agent/tasks/report`: a Task agent reports its own turn. */
export const agentTaskReportInputSchema = z
    .object({
        ask: z.string().trim().min(1).max(crewReportTextMaxLength).optional(),
        outcome: taskReportOutcomeSchema,
        person: z.string().trim().min(1).max(128).optional(),
        pullRequestUrls: z.array(z.string().trim().url().max(500)).max(20).default([]),
        text: z.string().trim().min(1).max(crewReportTextMaxLength),
    })
    .strict()
    .refine((input) => input.person === undefined || input.outcome === 'needs-you', {
        message: 'Only a needs-you report names a person.',
        path: ['person'],
    });

export type AgentTaskReportInput = z.infer<typeof agentTaskReportInputSchema>;

/** `POST /api/agent/tasks/send`: an agent posts in a Task's chat as itself and wakes it. */
export const agentTaskSendInputSchema = z
    .object({
        body: z.string().trim().min(1).max(20_000),
        delivery: taskDeliveryModeSchema.default('steer'),
        task: z.string().trim().min(1).max(128),
    })
    .strict();

export type AgentTaskSendInput = z.infer<typeof agentTaskSendInputSchema>;
