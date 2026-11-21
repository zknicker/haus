import * as z from 'zod';
import { idSchema } from './chat.ts';
import type { components } from './generated/openapi.d.ts';
import { taskKeySchema } from './task-key.ts';
import { workerTurnAttemptSchema } from './worker-computer-frames.ts';
import { workerObservedResultSchema, workerTurnInputTextMaxLength } from './worker-outcome.ts';
import { workerPlaceInputSchema, workerPlaceSchema } from './worker-place.ts';
import { workerModelSchema, workerRuntimeSchema } from './worker-runtime.ts';
import {
    workerActivitySchema,
    workerBranchSchema,
    workerProviderResultSchema,
    workerRefSchema,
    workerRepositorySchema,
    workerSchema,
    workerSummaryMaxLength,
    workerTitleSchema,
    workerTurnStatusSchema,
    workerUsageSchema,
} from './worker-shared.ts';
import { workerStallCodeSchema } from './worker-stall.ts';
import { workerStepsSchema } from './worker-steps.ts';

type HausAgentMessage = components['schemas']['AgentMessage'];

const timestampSchema = z.iso.datetime({ offset: true });
const nonceSchema = z.string().trim().min(1).max(128);
const workerTextSchema = z.string().trim().min(1).max(workerTurnInputTextMaxLength);

export const workerListForChatInputSchema = z
    .object({ serverId: idSchema, chatId: idSchema })
    .strict();
/** One read-only history Worker linked in a Chat, under the linking Message its card sits beneath. */
export const chatWorkerSchema = z
    .object({ anchorMessageId: idSchema, worker: workerSchema })
    .strict();
export const chatWorkerListSchema = z.array(chatWorkerSchema);
export type ChatWorker = z.infer<typeof chatWorkerSchema>;

export const workerLinksInputSchema = z
    .object({ serverId: idSchema, workerIds: z.array(idSchema).max(50) })
    .strict();

/** A conversation linking some read-only history Worker. */
export const workerLinkSchema = z
    .object({
        chatId: idSchema,
        workerId: idSchema,
    })
    .strict();

export const workerLinkListSchema = z.array(workerLinkSchema);
export type WorkerLink = z.infer<typeof workerLinkSchema>;

/**
 * `worker.onUpdated`: a Worker record changed. Ids only, scoped to the readers
 * of its Task's Chat (`chatId`). The App refetches `task.get` and `worker.get`.
 */
export const workerUpdatedEventSchema = z
    .object({
        chatId: idSchema,
        serverId: idSchema,
        taskId: idSchema,
        workerId: idSchema,
    })
    .strict();

export type WorkerUpdatedEvent = z.infer<typeof workerUpdatedEventSchema>;

/**
 * `haus worker start`: the brief and where it runs. `place` takes the object
 * or any string form, a Computer name included; without it the Task's Project
 * default applies. `repository` defaults to the Project's only repo. `runtime`
 * and `model` are for Computer places and refuse `WORKER_OPTION_CLOUD`
 * elsewhere. Every refusal comes before anything is written. `nonce` makes a
 * retried start return the same Worker.
 */
export const agentWorkerStartInputSchema = z
    .object({
        brief: workerTextSchema,
        model: workerModelSchema.optional(),
        nonce: nonceSchema,
        place: workerPlaceInputSchema.optional(),
        repository: workerRepositorySchema.optional(),
        runtime: workerRuntimeSchema.optional(),
        startingRef: workerRefSchema.nullable().default(null),
        task: taskKeySchema.optional(),
        title: workerTitleSchema,
    })
    .strict();

export type AgentWorkerStartInput = z.infer<typeof agentWorkerStartInputSchema>;

/**
 * The Worker and its first turn exist. `started` means the turn went to its
 * carrier; `queued` means it waits for a free slot on its place. Neither says
 * the provider began work: launch outcomes land on the Worker.
 */
export const agentWorkerReceiptSchema = z
    .object({
        state: z.enum(['started', 'queued']),
        worker: workerSchema,
    })
    .strict();

export type AgentWorkerReceipt = z.infer<typeof agentWorkerReceiptSchema>;

/**
 * The start was held by the same freshness check `haus message send` runs:
 * the Task's Chat has newer messages the Agent has not seen. Nothing was
 * created. `shownMessages` carries Agent message views; the Agent CLI
 * validates each one before rendering.
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

/** `haus worker stop`: the delegating Agent stops its own Worker's working or queued turn. */
export const agentWorkerStopInputSchema = z.object({ workerId: idSchema }).strict();

export const agentWorkerStopReceiptSchema = z.object({ worker: workerSchema }).strict();

export type AgentWorkerStopReceipt = z.infer<typeof agentWorkerStopReceiptSchema>;

/**
 * One bounded carrier observation of a provider turn. Applying it is
 * idempotent: a stale or duplicate observation changes nothing.
 *
 * Not `.strict()`: this is the one Computer-to-Server trust boundary in the
 * Worker wire contract, and Computer and Server deploy independently.
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
    /** Provider run creation time; observation time is only the reporting clock. */
    startedAt: timestampSchema.optional(),
    providerAgentId: z.string().trim().min(1).max(200).optional(),
    providerRunId: z.string().trim().min(1).max(200).optional(),
    providerUrl: z.url().max(2000).optional(),
    rawStatus: z.string().trim().min(1).max(120).optional(),
    /** The full result `summary` was cut from (TECH-8); absent before any turn observes one. */
    report: workerProviderResultSchema.optional(),
    /** The settled turn's final answer, read from the provider result; null when it had none. */
    result: workerObservedResultSchema.nullable().optional(),
    turnId: idSchema,
    /** Set on every reading of a stuck live turn; absent means it is not stalled. */
    stallCode: workerStallCodeSchema.optional(),
    /** The carrier's step summary of a cloud turn's tool calls so far; absent when it saw none. */
    steps: workerStepsSchema.optional(),
    status: workerTurnStatusSchema,
    summary: z.string().trim().min(1).max(workerSummaryMaxLength).optional(),
    usage: workerUsageSchema.optional(),
    workerId: idSchema,
});

export type WorkerObservation = z.infer<typeof workerObservationSchema>;

/**
 * One dispatched, unsettled turn the carrier must reconcile with the provider
 * after a reconnect, plus whether to stop it: a stop was recorded while it
 * was offline, or the Server already settled it stopped (a purged Task).
 * `attempt` is the turn's current start attempt, null when no start was sent;
 * a Computer holding no record of an attempted turn reports it ended
 * `uncertain` with that attempt.
 */
export const workerReconcileEntrySchema = z
    .object({
        attempt: workerTurnAttemptSchema.nullable(),
        place: workerPlaceSchema,
        providerAgentId: z.string().trim().min(1).max(200).nullable(),
        providerRunId: z.string().trim().min(1).max(200).nullable(),
        status: workerTurnStatusSchema,
        stopRequested: z.boolean(),
        turnId: idSchema,
        workerId: idSchema,
    })
    .strict();

export type WorkerReconcileEntry = z.infer<typeof workerReconcileEntrySchema>;

/**
 * `haus worker send`: queue a follow-up for the next turn. `interrupt` stops
 * the working turn and drops older queued follow-ups first. Posts no Message.
 */
export const agentWorkerSendInputSchema = z
    .object({
        interrupt: z.boolean().default(false),
        nonce: nonceSchema,
        text: workerTextSchema,
        workerId: idSchema,
    })
    .strict();
export type AgentWorkerSendInput = z.infer<typeof agentWorkerSendInputSchema>;
export const agentWorkerSendReceiptSchema = z
    .object({
        idempotent: z.boolean(),
        /** The turn the follow-up rides: the waiting next turn, or a new one. */
        turnId: idSchema,
        worker: workerSchema,
    })
    .strict();
export type AgentWorkerSendReceipt = z.infer<typeof agentWorkerSendReceiptSchema>;
export const agentWorkerListInputSchema = z.object({ workerId: idSchema.optional() }).strict();
export const agentWorkerListReceiptSchema = z.object({ workers: z.array(workerSchema) }).strict();

/** Human reads and writes. */
export const workerListActiveInputSchema = z.object({ serverId: idSchema }).strict();

export const workerGetInputSchema = z.object({ serverId: idSchema, workerId: idSchema }).strict();

export const workerStopInputSchema = z.object({ serverId: idSchema, workerId: idSchema }).strict();

/**
 * A person's follow-up from the Worker card: it posts a `worker-follow-up`
 * Message in the Task, authored by the person, and queues the same text.
 * `nonce` is the Message nonce, so a retried send posts and queues once.
 */
export const workerSendFollowUpInputSchema = z
    .object({
        nonce: nonceSchema,
        serverId: idSchema,
        text: workerTextSchema,
        workerId: idSchema,
    })
    .strict();

/** Where "Happening now" opens one Worker: its Task. */
export const activeWorkerLocationSchema = z
    .object({
        chatId: idSchema,
        kind: z.literal('task'),
        taskId: idSchema,
    })
    .strict();

export type ActiveWorkerLocation = z.infer<typeof activeWorkerLocationSchema>;

/**
 * One queued or working Worker visible to the viewer, with what the Inbox
 * "Happening now" section needs to name it and open its Task. The Chat facts
 * name the Channel the Task lives in.
 */
export const activeWorkerSchema = z
    .object({
        /** The delegating Agent's stored display name; a retired Agent keeps it. */
        agentName: z.string(),
        chatKind: z.enum(['channel', 'dm']),
        chatName: z.string().nullable(),
        chatPeerUserId: idSchema.nullable(),
        conversationChatId: idSchema,
        location: activeWorkerLocationSchema,
        taskId: idSchema,
        taskKey: z.string().min(1),
        worker: workerSchema,
    })
    .strict();

export const activeWorkerListSchema = z.array(activeWorkerSchema);

export type ActiveWorker = z.infer<typeof activeWorkerSchema>;
