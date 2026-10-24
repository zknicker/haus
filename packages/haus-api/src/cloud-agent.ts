import * as z from 'zod';
import { idSchema } from './chat.ts';
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
import type { components } from './generated/openapi.d.ts';

type HausAgentMessage = components['schemas']['AgentMessage'];

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
 * `cloudAgentWork.onUpdated`: work was created, observed, asked to cancel, or
 * newly linked. The Server publishes one event for each linking Message in a
 * live Chat (ADR 0044), Chat access scoped: `chatId`/`messageId` name that
 * linking Message. Ids only: the App invalidates that Message
 * (`chat.message`) and the work lists.
 */
export const cloudAgentWorkUpdatedEventSchema = z
    .object({
        chatId: idSchema,
        messageId: idSchema,
        parentChatId: idSchema.nullable(),
        serverId: idSchema,
        workId: idSchema,
    })
    .strict();

export type CloudAgentWorkUpdatedEvent = z.infer<typeof cloudAgentWorkUpdatedEventSchema>;

/**
 * `haus cloud-agent start` — the Agent-scoped creation request the Computer
 * forwards after its provider readiness check passes. The instructions the
 * provider runs never appear here: they stay on the Computer.
 */
export const agentCloudAgentStartInputSchema = z
    .object({
        /** The Trigger or Reminder fire the `--say` post answers, as on `haus message send`. */
        cause: z.string().trim().min(1).max(200).optional(),
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

/** The launch committed: its Message, work, and first Run exist. */
export const agentCloudAgentReceiptSchema = z
    .object({
        state: z.literal('started'),
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

/**
 * The launch was held by the same freshness check `haus message send` runs:
 * the target Chat has newer human or Agent messages the Agent has not seen.
 * Nothing was created and no provider was asked; the Agent re-runs the
 * command if the launch is still right. `shownMessages` carries Agent
 * message views; the Agent CLI validates each one before rendering.
 */
export const agentCloudAgentHeldSchema = z
    .object({
        state: z.literal('held'),
        formalMentionCount: z.number().int().nonnegative(),
        newMessageCount: z.number().int().positive(),
        omittedMessageCount: z.number().int().nonnegative(),
        shownMessages: z
            .array(
                z.custom<HausAgentMessage>((value) => typeof value === 'object' && value !== null)
            )
            .max(12),
    })
    .strict();

export type AgentCloudAgentHeld = z.infer<typeof agentCloudAgentHeldSchema>;

export const agentCloudAgentStartResponseSchema = z.discriminatedUnion('state', [
    agentCloudAgentReceiptSchema,
    agentCloudAgentHeldSchema,
]);

export type AgentCloudAgentStartResponse = z.infer<typeof agentCloudAgentStartResponseSchema>;

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
 * Where "Happening now" opens one work (ADR 0044, Q4). `work-thread`: the
 * launch work Thread, when the viewer can read it. `message`: otherwise the
 * newest visible linking Message. Its `chatId` is always the Channel or DM;
 * `threadChatId` is the Thread the Message sits in or anchors, which is what
 * opens when set. Otherwise the Message is revealed in `chatId`. Opening
 * never creates or follows a Thread.
 */
export const activeCloudAgentWorkLocationSchema = z.discriminatedUnion('kind', [
    z
        .object({
            anchorMessageId: idSchema,
            kind: z.literal('work-thread'),
            threadChatId: idSchema,
        })
        .strict(),
    z
        .object({
            chatId: idSchema,
            kind: z.literal('message'),
            messageId: idSchema,
            threadChatId: idSchema.nullable(),
        })
        .strict(),
]);

export type ActiveCloudAgentWorkLocation = z.infer<typeof activeCloudAgentWorkLocationSchema>;

/**
 * One queued or running work visible to the viewer, with everything the Inbox
 * "Happening now" section needs to name it and open its conversation. The
 * Chat facts always name the Channel or DM, never a Thread.
 */
export const activeCloudAgentWorkSchema = z
    .object({
        /** The delegating Agent's stored display name; a retired Agent keeps it. */
        agentName: z.string(),
        chatKind: z.enum(['channel', 'dm']),
        chatName: z.string().nullable(),
        chatPeerUserId: idSchema.nullable(),
        conversationChatId: idSchema,
        /** Where opening this row goes. */
        location: activeCloudAgentWorkLocationSchema,
        work: cloudAgentWorkSchema,
    })
    .strict();

export const activeCloudAgentWorkListSchema = z.array(activeCloudAgentWorkSchema);

export type ActiveCloudAgentWork = z.infer<typeof activeCloudAgentWorkSchema>;
