import * as z from 'zod';
import { agentInboxItemSchema, unreadElsewhereSchema } from './agent-inbox.ts';
import {
    agentTaskAssignmentNoticeSchema,
    agentTaskAssignmentsSchema,
} from './agent-task-assignment.ts';
import { idSchema } from './chat.ts';
import { timestampSchema } from './chat-contract-primitives.ts';
import { connectionChipKindSchema } from './connection-chips.ts';
import { traceCarrierSchema } from './trace-context.ts';

/**
 * One conversation that moved since the last heartbeat, as the digest shows it:
 * where, how much, who spoke, and whether the Agent was addressed. No bodies.
 */
export const heartbeatDigestEntrySchema = z
    .object({
        addressed: z.boolean(),
        afterSequence: z.number().int().nonnegative(),
        chatId: idSchema,
        kind: z.enum(['channel', 'dm', 'thread']),
        lastSpeaker: z.string().max(256).nullable(),
        messageCount: z.number().int().nonnegative(),
        speakers: z.array(z.string().max(256)).max(50),
        target: z.string().max(512),
        title: z.string().max(512),
    })
    .strict();

export type HeartbeatDigestEntry = z.infer<typeof heartbeatDigestEntrySchema>;

/** Most digest entries one heartbeat carries; `more` counts the rest. */
export const heartbeatDigestEntryLimit = 20;

/** Most open leads, open reminders, and connection names one heartbeat carries inline. */
export const heartbeatContextLimit = 10;

/** One open lead on the team's list: what `haus lead list` shows for it. */
export const heartbeatLeadSchema = z
    .object({
        agentHandle: z.string().min(1).max(128),
        id: idSchema,
        topic: z.string().min(1).max(200),
    })
    .strict();

/** One of the Agent's scheduled reminders. */
export const heartbeatReminderSchema = z
    .object({ fireAt: timestampSchema, id: idSchema, title: z.string().min(1).max(512) })
    .strict();

/**
 * The heartbeat attention: a chatless, private turn for the Agent's daytime look
 * around or nightly dream. `id` is its inbox identity
 * (`dream:<agentId>:<localDate>` or `heartbeat:<agentId>:<localDate>:<slot>`);
 * `since` is the previous settled heartbeat's start, null for the first.
 * `connections`, `leads`, and `reminders` are what every run would otherwise
 * fetch first: the Agent's granted connection names and its open work, bounded.
 */
export const agentHeartbeatAttentionSchema = z
    .object({
        connections: z.array(z.string().min(1).max(256)).max(heartbeatContextLimit).default([]),
        createdAt: timestampSchema,
        digest: z
            .object({
                entries: z.array(heartbeatDigestEntrySchema).max(heartbeatDigestEntryLimit),
                more: z.number().int().nonnegative(),
            })
            .strict(),
        id: idSchema,
        kind: z.enum(['daytime', 'nightly']),
        leads: z.array(heartbeatLeadSchema).max(heartbeatContextLimit).default([]),
        reminders: z.array(heartbeatReminderSchema).max(heartbeatContextLimit).default([]),
        since: timestampSchema.nullable(),
    })
    .strict();

export type AgentHeartbeatAttention = z.infer<typeof agentHeartbeatAttentionSchema>;

/**
 * A heartbeat's report, delivered to the main session as a chatless run
 * (`heartbeat-report:<heartbeatRunId>`).
 */
export const agentHeartbeatReportAttentionSchema = z
    .object({
        createdAt: timestampSchema,
        /** The kind of the heartbeat that filed the report; a nightly report waits for morning. */
        heartbeatKind: z.enum(['daytime', 'nightly']),
        heartbeatRunId: idSchema,
        id: idSchema,
        text: z.string().min(1).max(4000),
    })
    .strict();

export type AgentHeartbeatReportAttention = z.infer<typeof agentHeartbeatReportAttentionSchema>;

/** The daytime slot starts, local `HH:mm`, every three hours; the Computer derives its hours from these. */
export const daytimeHeartbeatSlots = ['08:00', '11:00', '14:00', '17:00', '20:00'] as const;
export const nightlyHeartbeatSlot = '03:00';

/**
 * Computer→Server: a heartbeat slot is due for this Agent. `slot` is the local
 * `HH:mm` slot start (`03:00` for nightly). The Server queues at most one run per
 * Agent per `kind`, `localDate`, and `slot`, and applies its own skip and pause rules.
 */
export const agentHeartbeatRequestSchema = z.discriminatedUnion('kind', [
    z
        .object({
            agentId: idSchema,
            kind: z.literal('daytime'),
            localDate: z.iso.date(),
            slot: z.enum(daytimeHeartbeatSlots),
            type: z.literal('agent-heartbeat-request'),
        })
        .strict(),
    z
        .object({
            agentId: idSchema,
            kind: z.literal('nightly'),
            localDate: z.iso.date(),
            slot: z.literal(nightlyHeartbeatSlot),
            type: z.literal('agent-heartbeat-request'),
        })
        .strict(),
]);

export type AgentHeartbeatRequest = z.infer<typeof agentHeartbeatRequestSchema>;

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
 * volatile runtime state; the Server stores only the latest. A report without `tasks` (an older
 * Computer) counts its sub-agents as its tasks.
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
        agentName: z.string().trim().min(1).max(64).optional(),
        /** Private voice layer for this Agent's own prompt; never part of an inbox item. */
        agentConversationStyle: z.string().max(10_000).optional(),
        /** The Agent's pickup reaction; null means the Computer's default. */
        agentSignatureEmoji: z.string().min(1).max(64).nullable().default(null),
        /** The run's Chat; null only for a chatless run: a heartbeat, report, wake, or assignment. */
        chatId: idSchema.nullable(),
        /** Chips the Server's connections add to chat; the prompt teaches the ones an Agent must write. */
        connectionChips: z.array(connectionChipKindSchema).max(16).default([]),
        /** Drainable on any start: concrete work, and human work addressed to this Agent. */
        drainItemIds: drainItemIdsSchema,
        /** This run carries the new Agent's one-time `#all` greeting (ADR 0028). */
        greets: z.literal(true).optional(),
        /** Present only on a heartbeat run, which carries no inbox items. */
        heartbeat: agentHeartbeatAttentionSchema.optional(),
        /** Present only on a report run, which resumes the main session. */
        heartbeatReport: agentHeartbeatReportAttentionSchema.optional(),
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
                frame.heartbeat,
                frame.heartbeatReport,
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
                'Only a heartbeat, heartbeat-report, sub-agent wake, or Task assignment run is chatless, and it carries nothing but its attention.',
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
    })
    .strict()
    .refine(
        (frame) =>
            frame.taskAssignments !== undefined ||
            (frame.inbox.length > 0 && frame.totalPending > 0),
        { message: 'A notice carries inbox work or Task assignments.', path: ['inbox'] }
    );

export type AgentNoticeCommand = z.infer<typeof agentNoticeCommandSchema>;
