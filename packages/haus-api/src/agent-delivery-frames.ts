import * as z from 'zod';
import { agentInboxItemSchema, unreadElsewhereSchema } from './agent-inbox.ts';
import { idSchema } from './chat.ts';
import { timestampSchema } from './chat-contract-primitives.ts';
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

/**
 * The heartbeat attention: a chatless, private turn for the Agent's daytime look
 * around or nightly dream. `id` is its inbox identity
 * (`dream:<agentId>:<localDate>` or `heartbeat:<agentId>:<localDate>:<slot>`);
 * `since` is the previous settled heartbeat's start, null for the first.
 */
export const agentHeartbeatAttentionSchema = z
    .object({
        createdAt: timestampSchema,
        digest: z
            .object({
                entries: z.array(heartbeatDigestEntrySchema).max(heartbeatDigestEntryLimit),
                more: z.number().int().nonnegative(),
            })
            .strict(),
        id: idSchema,
        kind: z.enum(['daytime', 'nightly']),
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
        heartbeatRunId: idSchema,
        id: idSchema,
        text: z.string().min(1).max(4000),
    })
    .strict();

export type AgentHeartbeatReportAttention = z.infer<typeof agentHeartbeatReportAttentionSchema>;

/**
 * Computer→Server: a heartbeat slot is due for this Agent. `slot` is the local
 * `HH:mm` slot start (`03:00` for nightly). The Server queues at most one run per
 * Agent per `kind`, `localDate`, and `slot`, and applies its own skip and pause rules.
 */
export const agentHeartbeatRequestSchema = z
    .object({
        agentId: idSchema,
        kind: z.enum(['daytime', 'nightly']),
        localDate: z.iso.date(),
        slot: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
        type: z.literal('agent-heartbeat-request'),
    })
    .strict();

export type AgentHeartbeatRequest = z.infer<typeof agentHeartbeatRequestSchema>;

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
        /** The run's Chat; null only for a heartbeat or heartbeat-report run. */
        chatId: idSchema.nullable(),
        /** Drainable on any start: concrete work, and human work addressed to this Agent. */
        drainItemIds: drainItemIdsSchema,
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
            const chatless = frame.heartbeat !== undefined || frame.heartbeatReport !== undefined;
            if (!chatless) {
                return frame.chatId !== null;
            }
            return (
                frame.chatId === null &&
                !(frame.heartbeat && frame.heartbeatReport) &&
                frame.inbox.length === 0 &&
                frame.drainItemIds.length === 0 &&
                frame.warmDrainItemIds.length === 0 &&
                frame.inboxDelivery === 'concrete'
            );
        },
        {
            message:
                'Only a heartbeat or heartbeat-report run is chatless, and it carries nothing but its attention.',
            path: ['chatId'],
        }
    );

export type AgentStartCommand = z.infer<typeof agentStartCommandSchema>;

/**
 * Work landed for a busy Agent. The full envelopes are accepted into the
 * Computer's durable inbox; only their content-free metadata projection is
 * injected into the live model turn.
 */
export const agentNoticeCommandSchema = z
    .object({
        agentId: idSchema,
        inbox: z.array(agentInboxItemSchema).min(1).max(100),
        runId: idSchema,
        totalPending: z.number().int().positive(),
        type: z.literal('notice'),
        unreadElsewhere: z.array(unreadElsewhereSchema).max(50).default([]),
    })
    .strict();

export type AgentNoticeCommand = z.infer<typeof agentNoticeCommandSchema>;
