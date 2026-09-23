import * as z from 'zod';
import { askStatusSchema } from './ask-shared.ts';
import { chatMessageReplySchema, idSchema } from './chat.ts';
import {
    cloudAgentBranchSchema,
    cloudAgentProviderSchema,
    cloudAgentStatusSchema,
    cloudAgentSummaryMaxLength,
    cloudAgentTitleSchema,
} from './cloud-agent-shared.ts';
import { messageTaskSchema } from './task-shared.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/**
 * A settled Cloud Agent Run's terminal attention for the Agent that delegated
 * it. It exists nowhere but the inbox row, so it carries the Run outcome the
 * Agent needs to inspect the work and post results as ordinary Messages.
 */
export const cloudAgentWorkAttentionSchema = z
    .object({
        branches: z.array(cloudAgentBranchSchema).max(50),
        errorCode: z.string().trim().min(1).max(120).nullable(),
        provider: cloudAgentProviderSchema,
        providerUrl: z.url().max(2000).nullable(),
        repository: z.string().trim().min(1).max(200),
        runId: idSchema,
        status: cloudAgentStatusSchema,
        summary: z.string().trim().min(1).max(cloudAgentSummaryMaxLength).nullable(),
        title: cloudAgentTitleSchema,
        workId: idSchema,
    })
    .strict();

export type CloudAgentWorkAttention = z.infer<typeof cloudAgentWorkAttentionSchema>;

/** The inbox projection of an Ask: who owes the answer, and whether it is still owed. */
export const inboxAskSchema = z
    .object({
        addresseeHandle: z.string().trim().min(1).max(128).nullable(),
        status: askStatusSchema,
    })
    .strict();

export type InboxAsk = z.infer<typeof inboxAskSchema>;

/** Why an item is addressed to this Agent personally rather than ambiently. */
export const addressedReasonSchema = z.enum(['dm', 'mention', 'routing']);

export type AddressedReason = z.infer<typeof addressedReasonSchema>;

/** One chat holding queued work no row of the current frame represents. */
export const unreadElsewhereSchema = z
    .object({
        count: z.number().int().positive(),
        target: z.string().trim().min(1).max(200),
    })
    .strict();

export type UnreadElsewhere = z.infer<typeof unreadElsewhereSchema>;

/** One message quoted in a thread context package, with the identity to attest it by. */
export const agentThreadContextMessageSchema = z
    .object({
        chatId: idSchema,
        /** The content was cut to the package budget, so it is not attested as seen. */
        clipped: z.boolean().optional(),
        content: z.string().max(4000),
        createdAt: timestampSchema,
        id: idSchema,
        senderDescription: z.string().trim().max(500).optional(),
        senderHandle: z.string().trim().min(1).max(128),
        senderType: z.enum(['agent', 'human']),
        sequence: z.number().int().positive(),
    })
    .strict();

export type AgentThreadContextMessage = z.infer<typeof agentThreadContextMessageSchema>;

/**
 * What an Agent mentioned in a Thread it has no model-visible context for
 * needs to answer in place: the parent it hangs from and the replies before the
 * mention, bounded (Raft's `thread_join_context`).
 */
export const agentThreadContextSchema = z
    .object({
        parentMessage: agentThreadContextMessageSchema,
        parentTarget: z.string().trim().min(1).max(200),
        /** Oldest first; the replies that precede the mention. */
        recentMessages: z.array(agentThreadContextMessageSchema).max(10),
        suggestedReadTarget: z.string().trim().min(1).max(200),
        threadTarget: z.string().trim().min(1).max(200),
        /** Earlier replies exist that the package leaves out. */
        truncated: z.boolean(),
    })
    .strict();

export type AgentThreadContext = z.infer<typeof agentThreadContextSchema>;

/** One Server-owned message envelope durably accepted into a Computer inbox. */
export const agentInboxItemSchema = z
    .object({
        chatId: idSchema,
        content: z.string().max(32_000),
        createdAt: timestampSchema,
        id: idSchema,
        /** This item names the Agent personally: a DM, an @mention, or a committed Jev narrow. */
        addressed: z.boolean().optional(),
        addressedReason: addressedReasonSchema.optional(),
        ask: inboxAskSchema.optional(),
        /** Typed Server attention; unlike a Chat message, it has no message cursor. */
        cloudAgentWork: cloudAgentWorkAttentionSchema.optional(),
        /** Canonical Agent API shape cached for Computer-local message checks. */
        message: z.record(z.string(), z.unknown()).optional(),
        mentioned: z.boolean().optional(),
        /** Bounded direct-parent and chain-root context for an inline reply. */
        reply: chatMessageReplySchema.nullable().optional(),
        senderDescription: z.string().trim().max(500).optional(),
        senderHandle: z.string().trim().min(1).max(128),
        senderType: z.enum(['agent', 'human', 'system', 'trigger']),
        /** Chat sequence, or zero for a typed attention with no Chat cursor. */
        sequence: z.number().int().nonnegative(),
        task: messageTaskSchema.optional(),
        target: z.string().trim().min(1).max(200),
        /** Present on the first drainable mention in a Thread the Agent cannot see yet. */
        threadContext: agentThreadContextSchema.optional(),
        threadFollowReactivated: z.boolean().optional(),
    })
    .strict()
    .refine(
        (item) =>
            item.cloudAgentWork
                ? item.sequence === 0 &&
                  item.id === item.cloudAgentWork.runId &&
                  item.senderType === 'system'
                : item.sequence > 0,
        {
            message: 'Typed attentions use their own identity and zero Chat sequence.',
            path: ['sequence'],
        }
    );

export type AgentInboxItem = z.infer<typeof agentInboxItemSchema>;
