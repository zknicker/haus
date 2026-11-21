import * as z from 'zod';
import {
    agentInboxItemSchema,
    driveConflictAttentionSchema,
    unreadElsewhereSchema,
} from './agent-inbox.ts';
import {
    agentTaskAssignmentNoticeSchema,
    agentTaskAssignmentsSchema,
} from './agent-task-assignment.ts';
import { timestampSchema } from './chat-contract-primitives.ts';
import { idSchema } from './chat.ts';
import { connectionChipKindSchema } from './connection-chips.ts';
import { traceCarrierSchema } from './trace-context.ts';
import { workerReportsNoticeSchema } from './worker-report-attention.ts';

/**
 * The sub-agent wake: a private turn for background work the Agent started on its runtime (a
 * Claude Code background sub-agent or shell) that finished or stopped after the turn that
 * started it ended. It has no Chat, sender, or body: the runtime's own report is already in the
 * Agent's conversation. `id` is its inbox identity (`subagent:<agentId>:<wake id>`).
 */
export const agentSubagentWakeAttentionSchema = z
    .object({ createdAt: timestampSchema, id: idSchema })
    .strict();

export type AgentSubagentWakeAttention = z.infer<typeof agentSubagentWakeAttentionSchema>;

/**
 * Computer→Server: how many background sub-agents (`subagents`) and background tasks of any
 * kind, shells included (`tasks`), each listed Agent runs right now, past the turn that started
 * them. Sent for one Agent when either count changes, and for every Agent the Computer hosts on
 * each connect, so a restarted Computer clears counts its processes took with them. A count is
 * volatile runtime state; the Server stores only the latest sub-agent count and ignores `tasks`.
 */
export const agentBackgroundWorkReportSchema = z
    .object({
        agents: z
            .array(
                z
                    .object({
                        agentId: idSchema,
                        subagents: z.number().int().min(0).max(64),
                        tasks: z.number().int().min(0).max(1000).optional(),
                    })
                    .strict()
            )
            .min(1)
            .max(500),
        type: z.literal('agent-background-work'),
    })
    .strict();

export type AgentBackgroundWorkReport = z.infer<typeof agentBackgroundWorkReportSchema>;

/**
 * The inbox items whose bodies may enter this run's prompt. Eligibility is
 * Server-owned; the lane is not. The Computer knows whether its harness session
 * resumed, so it drains {@link agentStartCommandSchema.shape.drainItemIds} on
 * every start and the warm set only when the session is alive, then attests what
 * it composed as exact run visibility (specs/inbox.md).
 */
const drainItemIdsSchema = z.array(idSchema).max(100).default([]);

/** Server→Computer launch command; Computer mints authority instead of receiving it. */
export const agentStartCommandSchema = z
    .object({
        agentId: idSchema,
        agentDescription: z.string().max(10_000).optional(),
        /** The Agent's handle, which also names its Drive area `agents/<handle>/`. */
        agentName: z.string().trim().min(1).max(64),
        /** Private voice layer for this Agent's own prompt; never part of an inbox item. */
        agentConversationStyle: z.string().max(10_000).optional(),
        /** The Agent's pickup reaction; null means the Computer's default. */
        agentSignatureEmoji: z.string().min(1).max(64).nullable().default(null),
        /**
         * The run's Chat; null only for a chatless run: a sub-agent wake, Task assignment, or
         * Drive conflict.
         */
        chatId: idSchema.nullable(),
        /** Chips the Server's connections add to chat; the prompt teaches the ones an Agent must write. */
        connectionChips: z.array(connectionChipKindSchema).max(16).default([]),
        /** Present only on a Drive conflict run: one push's kept-both, kept-edit, or refused files. */
        driveConflict: driveConflictAttentionSchema.optional(),
        /** Drainable on any start: concrete work, and human work addressed to this Agent. */
        drainItemIds: drainItemIdsSchema,
        /** This run carries the new Agent's one-time `#all` greeting (ADR 0028). */
        greets: z.literal(true).optional(),
        homeTimezone: z.string().trim().min(1).max(128).optional(),
        inbox: z.array(agentInboxItemSchema).max(100).default([]),
        /** Bodies are projected only for typed system attention or crash replay. */
        inboxDelivery: z.enum(['concrete', 'notice']),
        modelId: z.string().trim().min(1).max(128),
        runId: idSchema,
        runtimeId: z.string().trim().min(1).max(64),
        sessionGeneration: z.number().int().positive(),
        /** Present only on a sub-agent wake run, which carries no inbox items. */
        subagentWake: agentSubagentWakeAttentionSchema.optional(),
        /** Present only on a Task assignment run, which resumes the main session. */
        taskAssignments: agentTaskAssignmentsSchema.optional(),
        totalPending: z.number().int().nonnegative(),
        traceContext: traceCarrierSchema.optional(),
        type: z.literal('start'),
        /** Queued work in chats no row of this frame represents. Counts advance nothing. */
        unreadElsewhere: z.array(unreadElsewhereSchema).max(50).default([]),
        /** Additionally drainable when the harness session resumes: alive-idle parity. */
        warmDrainItemIds: drainItemIdsSchema,
    })
    .strict()
    .refine(
        (frame) => {
            const attentions = [
                frame.driveConflict,
                frame.subagentWake,
                frame.taskAssignments,
            ].filter((attention) => attention !== undefined).length;
            if (attentions === 0) {
                return frame.chatId !== null;
            }
            return (
                attentions === 1 &&
                frame.chatId === null &&
                frame.inbox.length === 0 &&
                frame.drainItemIds.length === 0 &&
                frame.warmDrainItemIds.length === 0 &&
                frame.inboxDelivery === 'concrete'
            );
        },
        {
            message:
                'Only a sub-agent wake, Task assignment, or Drive conflict run is chatless, and it carries nothing but its attention.',
            path: ['chatId'],
        }
    );

export type AgentStartCommand = z.infer<typeof agentStartCommandSchema>;

/**
 * Work landed for a busy Agent. The full envelopes are accepted into the
 * Computer's durable inbox; only their content-free metadata projection is
 * injected into the live model turn. Queued Task assignments have no envelope,
 * so they ride beside the inbox as a count; a notice carries at least one of the two.
 */
export const agentNoticeCommandSchema = z
    .object({
        agentId: idSchema,
        inbox: z.array(agentInboxItemSchema).max(100),
        runId: idSchema,
        taskAssignments: agentTaskAssignmentNoticeSchema.optional(),
        totalPending: z.number().int().nonnegative(),
        type: z.literal('notice'),
        unreadElsewhere: z.array(unreadElsewhereSchema).max(50).default([]),
        workerReports: workerReportsNoticeSchema.optional(),
    })
    .strict()
    .refine(
        (frame) =>
            frame.taskAssignments !== undefined ||
            frame.workerReports !== undefined ||
            (frame.inbox.length > 0 && frame.totalPending > 0),
        {
            message: 'A notice carries inbox work, Task assignments, or Worker reports.',
            path: ['inbox'],
        }
    );

export type AgentNoticeCommand = z.infer<typeof agentNoticeCommandSchema>;

/** Every work id a delivered notice covers, which its host acks back to the Server. */
export function noticeReceipt(notice: {
    readonly inbox: readonly { readonly id: string }[];
    readonly runId: string;
    readonly taskAssignments?: { readonly ids: readonly string[] };
    readonly workerReports?: { readonly ids: readonly string[] };
}) {
    return {
        runId: notice.runId,
        workIds: [
            ...notice.inbox.map((item) => item.id),
            ...(notice.taskAssignments?.ids ?? []),
            ...(notice.workerReports?.ids ?? []),
        ],
    };
}
