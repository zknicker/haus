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

/** One Server-owned message envelope durably accepted into a Computer inbox. */
export const agentInboxItemSchema = z
    .object({
        chatId: idSchema,
        content: z.string().max(32_000),
        createdAt: timestampSchema,
        id: idSchema,
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
