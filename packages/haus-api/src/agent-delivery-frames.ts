import * as z from 'zod';
import { agentInboxItemSchema, unreadElsewhereSchema } from './agent-inbox.ts';
import { idSchema } from './chat.ts';
import { timestampSchema } from './chat-contract-primitives.ts';
import { connectionChipKindSchema } from './connection-chips.ts';
import { traceCarrierSchema } from './trace-context.ts';

/**
 * The nightly dreaming attention: a private turn that exists only for the Agent's
 * own memory consolidation pass. It has no Chat, sender, or body; `id` is its
 * inbox identity (`dream:<agentId>:<Computer-local date>`).
 */
export const agentDreamAttentionSchema = z
    .object({ createdAt: timestampSchema, id: idSchema })
    .strict();

export type AgentDreamAttention = z.infer<typeof agentDreamAttentionSchema>;

/**
 * Computer→Server: this Agent's memory changed or outgrew its index, the Computer is
 * in its quiet window, and the Agent is idle here. The Server queues at most one
 * dream per Agent per `localDate`, and only for an idle, running Agent.
 */
export const agentDreamRequestSchema = z
    .object({
        agentId: idSchema,
        localDate: z.iso.date(),
        type: z.literal('agent-dream-request'),
    })
    .strict();

export type AgentDreamRequest = z.infer<typeof agentDreamRequestSchema>;

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
        /** The run's Chat; null only for a dream run, which has none. */
        chatId: idSchema.nullable(),
        /** Chips the Server's connections add to chat; the prompt teaches the ones an Agent must write. */
        connectionChips: z.array(connectionChipKindSchema).max(16).default([]),
        /** Present only on a dream run, which carries no inbox items. */
        dream: agentDreamAttentionSchema.optional(),
        /** Drainable on any start: concrete work, and human work addressed to this Agent. */
        drainItemIds: drainItemIdsSchema,
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
        (frame) =>
            frame.dream
                ? frame.chatId === null &&
                  frame.inbox.length === 0 &&
                  frame.drainItemIds.length === 0 &&
                  frame.warmDrainItemIds.length === 0 &&
                  frame.inboxDelivery === 'concrete'
                : frame.chatId !== null,
        {
            message: 'Only a dream run is chatless, and it carries nothing but its dream.',
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
