import * as z from 'zod';
import { agentInboxItemSchema, unreadElsewhereSchema } from './agent-inbox.ts';
import { idSchema } from './chat.ts';
import { traceCarrierSchema } from './trace-context.ts';

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
        chatId: idSchema,
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
        webAccess: z.enum(['fetch-only', 'search', 'search-only']).optional(),
    })
    .strict();

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
