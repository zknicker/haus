import * as z from 'zod';
import { type ChatMessage, chatMessageSchema, idSchema } from './chat.ts';
import {
    cloudAgentActivitySchema,
    cloudAgentBranchSchema,
    cloudAgentProviderSchema,
    cloudAgentRefSchema,
    cloudAgentRepositorySchema,
    cloudAgentStatusSchema,
    cloudAgentSummaryMaxLength,
    cloudAgentTitleSchema,
    cloudAgentUsageSchema,
    cloudAgentWorkSchema,
} from './cloud-agent-shared.ts';

const timestampSchema = z.iso.datetime({ offset: true });

export const cloudAgentWorkListForChatInputSchema = z
    .object({ serverId: idSchema, chatId: idSchema })
    .strict();
export const threadCloudAgentWorkSchema = z
    .object({ anchorMessageId: idSchema, work: cloudAgentWorkSchema })
    .strict();
export const threadCloudAgentWorkListSchema = z.array(threadCloudAgentWorkSchema);
export type ThreadCloudAgentWork = z.infer<typeof threadCloudAgentWorkSchema>;

/**
 * `haus cloud-agent start` — the Agent-scoped creation request the Computer
 * forwards after its provider readiness check passes. The instructions the
 * provider runs never appear here: they stay on the Computer.
 */
export const agentCloudAgentStartInputSchema = z
    .object({
        content: z.string().trim().min(1).max(32_000),
        nonce: z.string().trim().min(1).max(128),
        provider: cloudAgentProviderSchema,
        repository: cloudAgentRepositorySchema,
        replyToMessageId: idSchema.optional(),
        startingRef: cloudAgentRefSchema.nullable().default(null),
        target: z.string().trim().min(1).max(200),
        title: cloudAgentTitleSchema,
    })
    .strict();

export type AgentCloudAgentStartInput = z.infer<typeof agentCloudAgentStartInputSchema>;

export const agentCloudAgentReceiptSchema = z
    .object({
        chatId: idSchema,
        idempotent: z.boolean(),
        messageId: idSchema,
        /** The first Run, which the Computer launches against the provider. */
        runId: idSchema,
        sequence: z.number().int().positive(),
        target: z.string().trim().min(1),
        work: cloudAgentWorkSchema,
    })
    .strict();

export type AgentCloudAgentReceipt = z.infer<typeof agentCloudAgentReceiptSchema>;

/** `haus cloud-agent cancel` — the delegating Agent's cancellation request. */
export const agentCloudAgentCancelInputSchema = z.object({ workId: idSchema }).strict();

export const agentCloudAgentCancelReceiptSchema = z.object({ work: cloudAgentWorkSchema }).strict();

export type AgentCloudAgentCancelReceipt = z.infer<typeof agentCloudAgentCancelReceiptSchema>;

/**
 * One bounded Computer observation of a provider Run. Applying it is
 * idempotent: a stale or duplicate observation changes nothing.
 */
export const cloudAgentObservationSchema = z
    .object({
        activity: cloudAgentActivitySchema.optional(),
        branches: z.array(cloudAgentBranchSchema).max(50).optional(),
        errorCode: z.string().trim().min(1).max(120).optional(),
        observedAt: timestampSchema,
        providerAgentId: z.string().trim().min(1).max(200).optional(),
        providerRunId: z.string().trim().min(1).max(200).optional(),
        providerUrl: z.url().max(2000).optional(),
        rawStatus: z.string().trim().min(1).max(120).optional(),
        runId: idSchema,
        status: cloudAgentStatusSchema,
        summary: z.string().trim().min(1).max(cloudAgentSummaryMaxLength).optional(),
        usage: cloudAgentUsageSchema.optional(),
        workId: idSchema,
    })
    .strict();

export type CloudAgentObservation = z.infer<typeof cloudAgentObservationSchema>;

/**
 * One non-terminal work the Computer must reconcile with the provider after a
 * reconnect, plus any cancel request recorded while it was offline.
 */
export const cloudAgentReconcileEntrySchema = z
    .object({
        cancelRequested: z.boolean(),
        provider: cloudAgentProviderSchema,
        providerAgentId: z.string().trim().min(1).max(200).nullable(),
        providerRunId: z.string().trim().min(1).max(200).nullable(),
        runId: idSchema,
        status: cloudAgentStatusSchema,
        workId: idSchema,
    })
    .strict();

export type CloudAgentReconcileEntry = z.infer<typeof cloudAgentReconcileEntrySchema>;

export const agentCloudAgentSendInputSchema = z
    .object({ workId: idSchema, nonce: z.string().trim().min(1).max(128) })
    .strict();
export type AgentCloudAgentSendInput = z.infer<typeof agentCloudAgentSendInputSchema>;
export const agentCloudAgentSendReceiptSchema = z
    .object({
        work: cloudAgentWorkSchema,
        runId: idSchema,
        idempotent: z.boolean(),
        predecessors: z.array(cloudAgentReconcileEntrySchema),
    })
    .strict();
export type AgentCloudAgentSendReceipt = z.infer<typeof agentCloudAgentSendReceiptSchema>;
export const agentCloudAgentListInputSchema = z.object({ workId: idSchema.optional() }).strict();
export const agentCloudAgentListReceiptSchema = z
    .object({ works: z.array(cloudAgentWorkSchema) })
    .strict();

/** Human reads. */
export const cloudAgentWorkListActiveInputSchema = z.object({ serverId: idSchema }).strict();

export const cloudAgentWorkCancelInputSchema = z
    .object({ serverId: idSchema, workId: idSchema })
    .strict();

/**
 * One queued or running work visible to the viewer, with everything the Inbox
 * "Happening now" section needs to name it and open its conversation. Like
 * `OpenAsk`, the Chat facts always name the Channel or DM, never a Thread.
 */
export const activeCloudAgentWorkSchema = z
    .object({
        chatKind: z.enum(['channel', 'dm']),
        chatName: z.string().nullable(),
        chatPeerUserId: idSchema.nullable(),
        conversationChatId: idSchema,
        message: chatMessageSchema,
        threadAnchorMessage: chatMessageSchema.nullable(),
        threadChatId: idSchema,
        work: cloudAgentWorkSchema,
    })
    .strict();

export const activeCloudAgentWorkListSchema = z.array(activeCloudAgentWorkSchema);

export type ActiveCloudAgentWork = z.infer<typeof activeCloudAgentWorkSchema>;

/** The Message this work's Thread hangs off. */
export function activeCloudAgentWorkThreadAnchor(row: ActiveCloudAgentWork): ChatMessage {
    return row.threadAnchorMessage ?? row.message;
}
