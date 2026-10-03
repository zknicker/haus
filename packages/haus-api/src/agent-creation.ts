import * as z from 'zod';
import { agentReasoningEffortSchema } from './agent-execution.ts';
import {
    agentDescriptionInputSchema,
    agentDescriptionUpdateInputSchema,
} from './agent-profile-text.ts';
import { avatarMediaTypeSchema } from './avatar.ts';
import { participantHandleSchema } from './participant-handle.ts';

/** Local so the Message body union never imports the Chat contracts back. */
const idSchema = z.string().trim().min(1).max(200);

/**
 * The Agent one Agent created, as every reader of the creating Message needs
 * it: identity, current profile, and whether the Agent still exists. Agents
 * are retired rather than deleted, so `retired` is the whole lifecycle story.
 */
export const createdAgentSummarySchema = z
    .object({
        agentId: idSchema,
        avatarUrl: z.string().nullable(),
        description: z.string().max(500).nullable(),
        displayName: z.string().min(1).max(80),
        handle: participantHandleSchema,
        retired: z.boolean(),
    })
    .strict();

export type CreatedAgentSummary = z.infer<typeof createdAgentSummarySchema>;

/** `#name`, as every Agent-facing channel target is written. */
export const channelTargetSchema = z
    .string()
    .trim()
    .regex(/^#[A-Za-z0-9][A-Za-z0-9_-]{0,31}$/u, 'A channel target looks like "#product".');

/**
 * `content` is the Agent-authored message that carries the creation (ADR 0025);
 * it is required, so an `agent-created` Message is never an empty anchor. The
 * new Agent inherits the caller's Computer, runtime, model, and reasoning
 * effort, so none of those appear here.
 *
 * `brief` is the new Agent's standing instruction. It is durable Server state
 * rendered into the seeded workspace memory, not a Message, so nothing has to
 * DM the new Agent to tell it what it owns. `channels` names the channels it
 * joins on top of the Server's `#all`, which creation always joins.
 */
export const agentCreateAgentInputSchema = z
    .object({
        avatarConcept: z.string().trim().min(1).max(280).nullable().default(null),
        brief: z.string().trim().min(1).max(4000).nullable().default(null),
        channels: z.array(channelTargetSchema).max(20).default([]),
        content: z.string().trim().min(1).max(4000),
        description: agentDescriptionInputSchema,
        displayName: z.string().trim().min(1).max(80),
        nonce: z.string().trim().min(1).max(128),
        target: z.string().trim().min(1).max(200),
    })
    .strict();

export type AgentCreateAgentInput = z.infer<typeof agentCreateAgentInputSchema>;

/**
 * What became of the requested avatar. `unavailable` is the one degradation:
 * the Server has no avatar provider provisioned, which no retry can change, so
 * the Agent is created without one. Transient generation failures refuse the
 * whole request instead and never reach a receipt.
 */
export const agentCreatedAvatarOutcomeSchema = z.discriminatedUnion('status', [
    z.object({ status: z.literal('none') }).strict(),
    z.object({ byteSize: z.number().int().positive(), status: z.literal('generated') }).strict(),
    z
        .object({
            code: z.literal('AVATAR_PROVIDER_UNAVAILABLE'),
            note: z.string().min(1),
            status: z.literal('unavailable'),
        })
        .strict(),
]);

export type AgentCreatedAvatarOutcome = z.infer<typeof agentCreatedAvatarOutcomeSchema>;

export const agentCreateAgentReceiptSchema = z
    .object({
        agent: createdAgentSummarySchema,
        avatar: agentCreatedAvatarOutcomeSchema,
        /** Every channel the new Agent joined, `#all` first. */
        channels: z.array(channelTargetSchema),
        chatId: idSchema,
        computerId: idSchema,
        idempotent: z.boolean(),
        messageId: idSchema,
        modelId: z.string(),
        reasoningEffort: agentReasoningEffortSchema,
        runtimeId: z.string(),
        sequence: z.number().int().positive(),
        target: z.string().min(1),
    })
    .strict();

export type AgentCreateAgentReceipt = z.infer<typeof agentCreateAgentReceiptSchema>;

/**
 * Only the description changes. The handle is derived from the display name at
 * creation and is the Server-scoped alias every `@mention` already written into
 * history keys on, so renaming is a distinct operation this one does not carry.
 */
export const agentUpdateAgentInputSchema = z
    .object({
        agent: z.string().trim().min(1).max(64),
        description: agentDescriptionUpdateInputSchema,
    })
    .strict();

export type AgentUpdateAgentInput = z.infer<typeof agentUpdateAgentInputSchema>;

export const agentUpdateAgentReceiptSchema = z
    .object({ agent: createdAgentSummarySchema })
    .strict();

export type AgentUpdateAgentReceipt = z.infer<typeof agentUpdateAgentReceiptSchema>;

export const agentSetAgentAvatarInputSchema = z
    .object({
        agent: z.string().trim().min(1).max(64),
        concept: z.string().trim().min(1).max(280),
    })
    .strict();

export type AgentSetAgentAvatarInput = z.infer<typeof agentSetAgentAvatarInputSchema>;

export const agentSetAgentAvatarReceiptSchema = z
    .object({
        agent: createdAgentSummarySchema,
        avatar: z
            .object({
                byteSize: z.number().int().positive(),
                height: z.number().int().positive(),
                mediaType: avatarMediaTypeSchema,
                width: z.number().int().positive(),
            })
            .strict(),
    })
    .strict();

export type AgentSetAgentAvatarReceipt = z.infer<typeof agentSetAgentAvatarReceiptSchema>;

/**
 * Put an Agent in a channel. Any active Agent may add any active Agent; the
 * add is idempotent and wakes nobody, so it is a membership correction rather
 * than a delivery. Cove's membership stays product-owned.
 */
export const agentAddChannelAgentInputSchema = z
    .object({
        agent: z.string().trim().min(1).max(64),
        target: channelTargetSchema,
    })
    .strict();

export type AgentAddChannelAgentInput = z.infer<typeof agentAddChannelAgentInputSchema>;

export const agentAddChannelAgentReceiptSchema = z
    .object({
        /** False when that Agent was already a member. */
        added: z.boolean(),
        handle: participantHandleSchema,
        target: channelTargetSchema,
    })
    .strict();

export type AgentAddChannelAgentReceipt = z.infer<typeof agentAddChannelAgentReceiptSchema>;
