import * as z from 'zod';
import { agentReasoningEffortSchema } from './agent-execution.ts';
import {
    agentDescriptionInputSchema,
    agentDescriptionUpdateInputSchema,
    signatureEmojiInputSchema,
} from './agent-profile-text.ts';
import { avatarBytesInputSchema, avatarMediaTypeSchema } from './avatar.ts';
import { idSchema as appIdSchema } from './chat-contract-primitives.ts';
import { participantHandleSchema } from './participant-handle.ts';
import { TASK_KEY_PREFIX_PATTERN } from './task-key-ledger.ts';

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

/** Creating an Agent binds it to exactly one reported Computer, runtime, and model. */
export const createAgentInputSchema = z
    .object({
        avatar: avatarBytesInputSchema.optional(),
        computerId: appIdSchema,
        description: agentDescriptionInputSchema.nullable().optional(),
        displayName: z.string().trim().min(1).max(80),
        handle: participantHandleSchema,
        /** Omitted: the Haus project, so the new Agent is a generalist. */
        homeProjectId: appIdSchema.optional(),
        modelId: z.string().trim().min(1).max(128),
        reasoningEffort: agentReasoningEffortSchema.default('medium'),
        runtimeId: z.string().trim().min(1).max(64),
        serverId: appIdSchema,
        /** Omitted or null: the Agent picks up messages with the default 👀. */
        signatureEmoji: signatureEmojiInputSchema.nullable().optional(),
    })
    .strict();

export type CreateAgentInput = z.infer<typeof createAgentInputSchema>;

/** A Project key as an Agent writes it; `sec` names `SEC`. */
export const projectKeyTargetSchema = z
    .string()
    .trim()
    .toUpperCase()
    .regex(TASK_KEY_PREFIX_PATTERN, 'A Project key looks like "SEC".');

/**
 * Creation writes no Message. `target` names the conversation authorizing the
 * request; the caller introduces the returned identity through ordinary send.
 * The new Agent inherits the caller's execution configuration.
 *
 * `brief` is the new Agent's standing instruction. It is durable Server state
 * rendered into the seeded workspace memory, not a Message, so nothing has to
 * DM the new Agent to tell it what it owns. `project` names its home Project
 * by key; null makes it a generalist, homed in the Haus project.
 * `signatureEmoji` is the new Agent's pickup reaction; null means the default 👀.
 */
/** Server decoder retains missing legacy briefs solely for skew errors and nonce replay. */
export const agentCreateAgentRequestSchema = z
    .object({
        avatarConcept: z.string().trim().min(1).max(280).nullable().default(null),
        brief: z.string().trim().min(1).max(4000).nullable().default(null),
        description: agentDescriptionInputSchema,
        displayName: z.string().trim().min(1).max(80),
        nonce: z.string().trim().min(1).max(128),
        project: projectKeyTargetSchema.nullable().default(null),
        signatureEmoji: signatureEmojiInputSchema.nullable().default(null),
        target: z.string().trim().min(1).max(200),
    })
    .strict();

export type AgentCreateAgentRequest = z.infer<typeof agentCreateAgentRequestSchema>;

/** New Agent-owned creation always carries durable standing instructions. */
export const agentCreateAgentInputSchema = agentCreateAgentRequestSchema.extend({
    brief: z.string().trim().min(1).max(4000),
});
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
        chatId: idSchema,
        computerId: idSchema,
        idempotent: z.boolean(),
        modelId: z.string(),
        /** The key of the new Agent's home Project. */
        project: z.string().regex(TASK_KEY_PREFIX_PATTERN),
        reasoningEffort: agentReasoningEffortSchema,
        runtimeId: z.string(),
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
