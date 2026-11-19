import * as z from 'zod';
import { idSchema } from './chat.ts';
import type { components } from './generated/openapi.d.ts';
import { taskKeySchema } from './task-key.ts';
import {
    workerActivitySchema,
    workerBranchSchema,
    cloudAgentProviderSchema,
    workerRefSchema,
    workerReportSchema,
    workerRepositorySchema,
    workerTurnStatusSchema,
    workerSummaryMaxLength,
    workerTitleSchema,
    workerUsageSchema,
    workerSchema,
} from './worker-shared.ts';
import { workerStallCodeSchema } from './worker-stall.ts';

type HausAgentMessage = components['schemas']['AgentMessage'];

const timestampSchema = z.iso.datetime({ offset: true });

export const workerListForChatInputSchema = z
    .object({ serverId: idSchema, chatId: idSchema })
    .strict();
/** One work linked in a Chat, under the linking Message its card sits beneath. */
export const chatWorkerSchema = z
    .object({ anchorMessageId: idSchema, worker: workerSchema })
    .strict();
export const chatWorkerListSchema = z.array(chatWorkerSchema);
export type ChatWorker = z.infer<typeof chatWorkerSchema>;

export const workerLinksInputSchema = z
    .object({ serverId: idSchema, workerIds: z.array(idSchema).max(50) })
    .strict();

/** A conversation linking some work. */
export const workerLinkSchema = z
    .object({
        chatId: idSchema,
        workerId: idSchema,
    })
    .strict();

export const workerLinkListSchema = z.array(workerLinkSchema);
export type WorkerLink = z.infer<typeof workerLinkSchema>;

/**
 * `worker.onUpdated`: work was created, observed, asked to cancel, or
 * newly linked. The Server publishes one event for each linking Message in a
 * live Chat (ADR 0044), Chat access scoped: `chatId`/`messageId` name that
 * linking Message. Ids only: the App invalidates that Message
 * (`chat.message`), the work lists, and the Task the work is attached to.
 */
export const workerUpdatedEventSchema = z
    .object({
        chatId: idSchema,
        messageId: idSchema,
        serverId: idSchema,
        taskId: idSchema.nullable(),
        workerId: idSchema,
    })
    .strict();

export type WorkerUpdatedEvent = z.infer<typeof workerUpdatedEventSchema>;

/**
 * `haus worker start` — the Agent-scoped creation request the Computer
 * forwards after its provider readiness check passes. The instructions the
 * provider runs never appear here: they stay on the Computer.
 */
export const agentWorkerStartInputSchema = z
    .object({
        /** The Trigger or Reminder fire the `--say` post answers, as on `haus message send`. */
        cause: z.string().trim().min(1).max(200).optional(),
        content: z.string().trim().min(1).max(32_000),
        nonce: z.string().trim().min(1).max(128),
        provider: cloudAgentProviderSchema,
        repository: workerRepositorySchema,
        replyToMessageId: idSchema.optional(),
        startingRef: workerRefSchema.nullable().default(null),
        target: z.string().trim().min(1).max(200),
        task: taskKeySchema.optional(),
        title: workerTitleSchema,
    })
    .strict();

export type AgentWorkerStartInput = z.infer<typeof agentWorkerStartInputSchema>;

/** The launch committed: its Message, work, and first Run exist. */
export const agentWorkerReceiptSchema = z
    .object({
        state: z.literal('started'),
        chatId: idSchema,
        idempotent: z.boolean(),
        messageId: idSchema,
        /** The first Run, which the Computer launches against the provider. */
        turnId: idSchema,
        sequence: z.number().int().positive(),
        target: z.string().trim().min(1),
        worker: workerSchema,
    })
    .strict();

export type AgentWorkerReceipt = z.infer<typeof agentWorkerReceiptSchema>;

/**
 * The launch was held by the same freshness check `haus message send` runs:
 * the target Chat has newer human or Agent messages the Agent has not seen.
 * Nothing was created and no provider was asked; the Agent re-runs the
 * command if the launch is still right. `shownMessages` carries Agent
 * message views; the Agent CLI validates each one before rendering.
 */
export const agentWorkerHeldSchema = z
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

export type AgentWorkerHeld = z.infer<typeof agentWorkerHeldSchema>;

export const agentWorkerStartResponseSchema = z.discriminatedUnion('state', [
    agentWorkerReceiptSchema,
    agentWorkerHeldSchema,
]);

export type AgentWorkerStartResponse = z.infer<typeof agentWorkerStartResponseSchema>;

/** `haus worker cancel` — the delegating Agent's cancellation request. */
export const agentWorkerCancelInputSchema = z.object({ workerId: idSchema }).strict();

export const agentWorkerCancelReceiptSchema = z.object({ worker: workerSchema }).strict();

export type AgentWorkerCancelReceipt = z.infer<typeof agentWorkerCancelReceiptSchema>;

/**
 * One bounded Computer observation of a provider Run. Applying it is
 * idempotent: a stale or duplicate observation changes nothing.
 *
 * Not `.strict()`: this is the one Computer-to-Server trust boundary in the
 * worker wire contract, and Computer and Server deploy independently.
 * A `.strict()` schema rejects the whole frame on an unrecognized key, so a
 * newer Computer sending a field an older Server's schema does not know yet
 * would otherwise lose the entire observation instead of just that field.
 * Every future addition here must stay `.optional()` for the same reason.
 */
export const workerObservationSchema = z.object({
    activity: workerActivitySchema.optional(),
    branches: z.array(workerBranchSchema).max(50).optional(),
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
    report: workerReportSchema.optional(),
    turnId: idSchema,
    /** Set on every reading of a stuck live Run; absent means it is not stalled. */
    stallCode: workerStallCodeSchema.optional(),
    status: workerTurnStatusSchema,
    summary: z.string().trim().min(1).max(workerSummaryMaxLength).optional(),
    usage: workerUsageSchema.optional(),
    workerId: idSchema,
});

export type WorkerObservation = z.infer<typeof workerObservationSchema>;

/**
 * One non-terminal work the Computer must reconcile with the provider after a
 * reconnect, plus any cancel request recorded while it was offline.
 */
export const workerReconcileEntrySchema = z
    .object({
        cancelRequested: z.boolean(),
        provider: cloudAgentProviderSchema,
        providerAgentId: z.string().trim().min(1).max(200).nullable(),
        providerRunId: z.string().trim().min(1).max(200).nullable(),
        turnId: idSchema,
        status: workerTurnStatusSchema,
        workerId: idSchema,
    })
    .strict();

export type WorkerReconcileEntry = z.infer<typeof workerReconcileEntrySchema>;

export const agentWorkerSendInputSchema = z
    .object({ workerId: idSchema, nonce: z.string().trim().min(1).max(128) })
    .strict();
export type AgentWorkerSendInput = z.infer<typeof agentWorkerSendInputSchema>;
export const agentWorkerSendReceiptSchema = z
    .object({
        worker: workerSchema,
        turnId: idSchema,
        idempotent: z.boolean(),
        predecessors: z.array(workerReconcileEntrySchema),
    })
    .strict();
export type AgentWorkerSendReceipt = z.infer<typeof agentWorkerSendReceiptSchema>;
export const agentWorkerListInputSchema = z.object({ workerId: idSchema.optional() }).strict();
export const agentWorkerListReceiptSchema = z.object({ workers: z.array(workerSchema) }).strict();

/** Human reads. */
export const workerListActiveInputSchema = z.object({ serverId: idSchema }).strict();

export const workerCancelInputSchema = z
    .object({ serverId: idSchema, workerId: idSchema })
    .strict();

/**
 * Where "Happening now" opens one work (ADR 0044, Q4): the launch Message when
 * the viewer can read it, otherwise the newest visible linking Message,
 * revealed in its Chat (a Channel, DM, or Task's Chat).
 */
export const activeWorkerLocationSchema = z
    .object({
        chatId: idSchema,
        kind: z.literal('message'),
        messageId: idSchema,
    })
    .strict();

export type ActiveWorkerLocation = z.infer<typeof activeWorkerLocationSchema>;

/**
 * One queued or running work visible to the viewer, with everything the Inbox
 * "Happening now" section needs to name it and open its conversation. The
 * Chat facts always name the Channel or DM, a Task's through its Channel.
 */
export const activeWorkerSchema = z
    .object({
        /** The delegating Agent's stored display name; a retired Agent keeps it. */
        agentName: z.string(),
        chatKind: z.enum(['channel', 'dm']),
        chatName: z.string().nullable(),
        chatPeerUserId: idSchema.nullable(),
        conversationChatId: idSchema,
        /** Where opening this row goes. */
        location: activeWorkerLocationSchema,
        taskId: idSchema.nullable(),
        taskKey: z.string().min(1).nullable(),
        worker: workerSchema,
    })
    .strict()
    .refine((row) => (row.taskId === null) === (row.taskKey === null), {
        message: 'A Task id and its key come together.',
        path: ['taskKey'],
    });

export const activeWorkerListSchema = z.array(activeWorkerSchema);

export type ActiveWorker = z.infer<typeof activeWorkerSchema>;
