import * as z from 'zod';
import { idSchema } from './chat.ts';
import {
    cloudAgentActivitySchema,
    cloudAgentBranchSchema,
    cloudAgentProviderSchema,
    cloudAgentRefSchema,
    cloudAgentReportSchema,
    cloudAgentRepositorySchema,
    cloudAgentStatusSchema,
    cloudAgentSummaryMaxLength,
    cloudAgentTitleSchema,
    cloudAgentUsageSchema,
    cloudAgentWorkSchema,
} from './cloud-agent-shared.ts';
import { cloudAgentStallCodeSchema } from './cloud-agent-stall.ts';
import type { components } from './generated/openapi.d.ts';
import { taskKeySchema } from './task-key.ts';

type HausAgentMessage = components['schemas']['AgentMessage'];

const timestampSchema = z.iso.datetime({ offset: true });

export const cloudAgentWorkListForChatInputSchema = z
    .object({ serverId: idSchema, chatId: idSchema })
    .strict();
/** One work linked in a Chat, under the linking Message its card sits beneath. */
export const chatCloudAgentWorkSchema = z
    .object({ anchorMessageId: idSchema, work: cloudAgentWorkSchema })
    .strict();
export const chatCloudAgentWorkListSchema = z.array(chatCloudAgentWorkSchema);
export type ChatCloudAgentWork = z.infer<typeof chatCloudAgentWorkSchema>;

export const cloudAgentWorkLinksInputSchema = z
    .object({ serverId: idSchema, workIds: z.array(idSchema).max(50) })
    .strict();

/** A conversation linking some work. */
export const cloudAgentWorkLinkSchema = z
    .object({
        chatId: idSchema,
        workId: idSchema,
    })
    .strict();

export const cloudAgentWorkLinkListSchema = z.array(cloudAgentWorkLinkSchema);
export type CloudAgentWorkLink = z.infer<typeof cloudAgentWorkLinkSchema>;

/**
 * `cloudAgentWork.onUpdated`: work was created, observed, asked to cancel, or
 * newly linked. The Server publishes one event for each linking Message in a
 * live Chat (ADR 0044), Chat access scoped: `chatId`/`messageId` name that
 * linking Message. Ids only: the App invalidates that Message
 * (`chat.message`), the work lists, and the Task the work is attached to.
 */
export const cloudAgentWorkUpdatedEventSchema = z
    .object({
        chatId: idSchema,
        messageId: idSchema,
        serverId: idSchema,
        taskId: idSchema.nullable(),
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
        task: taskKeySchema.optional(),
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
 *
 * Not `.strict()`: this is the one Computer-to-Server trust boundary in the
 * cloud-agent wire contract, and Computer and Server deploy independently.
 * A `.strict()` schema rejects the whole frame on an unrecognized key, so a
 * newer Computer sending a field an older Server's schema does not know yet
 * would otherwise lose the entire observation instead of just that field.
 * Every future addition here must stay `.optional()` for the same reason.
 */
export const cloudAgentObservationSchema = z.object({
    activity: cloudAgentActivitySchema.optional(),
    branches: z.array(cloudAgentBranchSchema).max(50).optional(),
    environmentId: z.string().trim().min(1).max(200).optional(),
    environmentName: z.string().trim().min(1).max(200).optional(),
    errorCode: z.string().trim().min(1).max(120).optional(),
    observedAt: timestampSchema,
    /** Provider Run creation time; observation time is only the reporting clock. */
    startedAt: timestampSchema.optional(),
    providerAgentId: z.string().trim().min(1).max(200).optional(),
    providerRunId: z.string().trim().min(1).max(200).optional(),
    providerUrl: z.url().max(2000).optional(),
    rawStatus: z.string().trim().min(1).max(120).optional(),
    /** The full report `summary` was cut from (TECH-8); absent before any Run observes one. */
    report: cloudAgentReportSchema.optional(),
    runId: idSchema,
    /** Set on every reading of a stuck live Run; absent means it is not stalled. */
    stallCode: cloudAgentStallCodeSchema.optional(),
    status: cloudAgentStatusSchema,
    summary: z.string().trim().min(1).max(cloudAgentSummaryMaxLength).optional(),
    usage: cloudAgentUsageSchema.optional(),
    workId: idSchema,
});

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
 * Where "Happening now" opens one work (ADR 0044, Q4): the launch Message when
 * the viewer can read it, otherwise the newest visible linking Message,
 * revealed in its Chat (a Channel, DM, or Task's Chat).
 */
export const activeCloudAgentWorkLocationSchema = z
    .object({
        chatId: idSchema,
        kind: z.literal('message'),
        messageId: idSchema,
    })
    .strict();

export type ActiveCloudAgentWorkLocation = z.infer<typeof activeCloudAgentWorkLocationSchema>;

/**
 * One queued or running work visible to the viewer, with everything the Inbox
 * "Happening now" section needs to name it and open its conversation. The
 * Chat facts always name the Channel or DM, a Task's through its Channel.
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
        taskId: idSchema.nullable(),
        taskKey: z.string().min(1).nullable(),
        work: cloudAgentWorkSchema,
    })
    .strict()
    .refine((row) => (row.taskId === null) === (row.taskKey === null), {
        message: 'A Task id and its key come together.',
        path: ['taskKey'],
    });

export const activeCloudAgentWorkListSchema = z.array(activeCloudAgentWorkSchema);

export type ActiveCloudAgentWork = z.infer<typeof activeCloudAgentWorkSchema>;
