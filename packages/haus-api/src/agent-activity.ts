import * as z from 'zod';
import { agentRunTriggerEntrySchema } from './agent-turn-trigger.ts';
import { idSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });
const positiveSequenceSchema = z.number().int().positive().safe();
const producerIdSchema = z.string().trim().min(1).max(128);
const safeToolRefSchema = z
    .string()
    .trim()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9][a-z0-9._:-]*$/u);

export const agentActivityCategorySchema = z.enum([
    'starting_work',
    'checking_messages',
    'received_message',
    'thinking',
    'updating_instructions',
    'browsing',
    'searching_web',
    'reading_files',
    'editing_files',
    'running_command',
    'using_tool',
    'delegating',
    'sending_message',
    'working',
]);

export type AgentActivityCategory = z.infer<typeof agentActivityCategorySchema>;

export const agentActivityPhaseSchema = z.enum(['started', 'completed', 'failed', 'interrupted']);
export type AgentActivityPhase = z.infer<typeof agentActivityPhaseSchema>;

/**
 * What a settled turn counts. Mostly the semantic activity categories that are work;
 * `delegating` counts sub-agents, and `generating_image` / `generating_video` are turn-only:
 * a native image or video tool opens `using_tool` activity but counts here instead, because
 * the media is usually what the human asked for.
 */
export const agentTurnOperationCategorySchema = z.enum([
    'browsing',
    'checking_messages',
    'delegating',
    'editing_files',
    'generating_image',
    'generating_video',
    'reading_files',
    'running_command',
    'searching_web',
    'updating_instructions',
    'using_tool',
]);
export type AgentTurnOperationCategory = z.infer<typeof agentTurnOperationCategorySchema>;

export const agentTurnOperationCountSchema = z
    .object({
        category: agentTurnOperationCategorySchema,
        completed: z.number().int().nonnegative().safe(),
        failed: z.number().int().nonnegative().safe(),
        interrupted: z.number().int().nonnegative().safe(),
    })
    .strict()
    .refine((count) => count.completed + count.failed + count.interrupted > 0, {
        message: 'An operation count must include at least one settled operation.',
    });
export type AgentTurnOperationCount = z.infer<typeof agentTurnOperationCountSchema>;

/** Exact Computer-owned semantic operation totals for one settled turn. */
export const agentTurnActivitySummarySchema = z
    .object({
        operations: z
            .array(agentTurnOperationCountSchema)
            .max(agentTurnOperationCategorySchema.options.length),
    })
    .strict()
    .refine(
        (summary) =>
            new Set(summary.operations.map((operation) => operation.category)).size ===
            summary.operations.length,
        { message: 'Operation categories must be unique.' }
    );

export type AgentTurnActivitySummary = z.infer<typeof agentTurnActivitySummarySchema>;

/**
 * An opaque Computer-hashed id that pairs one operation's start with its settlement.
 * Only `delegating` carries one today; it never reveals the runtime's tool-call id.
 */
export const agentActivityOperationIdSchema = z.string().regex(/^[0-9a-f]{16,64}$/u);

/** The current-activity snapshot lists at most this many running sub-agents. */
export const AGENT_ACTIVE_DELEGATIONS_MAX = 16;

/** One sub-agent the Agent delegated to that has not settled yet. */
export const agentActiveDelegationSchema = z
    .object({
        operationId: agentActivityOperationIdSchema,
        startedAt: timestampSchema,
    })
    .strict();
export type AgentActiveDelegation = z.infer<typeof agentActiveDelegationSchema>;

export const agentActivityProducerSchema = z.enum(['server', 'computer']);
export type AgentActivityProducer = z.infer<typeof agentActivityProducerSchema>;

/** The only activity frame a Computer may submit to the Server. */
export const agentActivityFrameSchema = z
    .object({
        agentId: idSchema,
        category: agentActivityCategorySchema,
        occurredAt: timestampSchema,
        operationId: agentActivityOperationIdSchema.optional(),
        phase: agentActivityPhaseSchema,
        producerSequence: positiveSequenceSchema,
        runId: idSchema,
        toolRef: safeToolRefSchema.optional(),
        type: z.literal('agent-activity'),
    })
    .strict();

export type AgentActivityFrame = z.infer<typeof agentActivityFrameSchema>;

/** A committed semantic activity row, enriched by the Server. */
export const agentActivityEventSchema = z
    .object({
        agentId: idSchema,
        category: agentActivityCategorySchema,
        id: idSchema,
        occurredAt: timestampSchema,
        operationId: agentActivityOperationIdSchema.optional(),
        phase: agentActivityPhaseSchema,
        position: positiveSequenceSchema,
        producer: agentActivityProducerSchema,
        producerId: producerIdSchema,
        producerSequence: positiveSequenceSchema,
        runId: idSchema,
        serverId: idSchema,
        toolRef: safeToolRefSchema.optional(),
    })
    .strict();

export type AgentActivityEvent = z.infer<typeof agentActivityEventSchema>;

export const agentCurrentActivitySchema = agentActivityEventSchema.extend({
    /** Running sub-agents of this run, oldest first; omitted when none run. */
    activeDelegations: z
        .array(agentActiveDelegationSchema)
        .min(1)
        .max(AGENT_ACTIVE_DELEGATIONS_MAX)
        .optional(),
    runStartedAt: timestampSchema.nullable(),
});
export type AgentCurrentActivity = z.infer<typeof agentCurrentActivitySchema>;

/** Projects one journal event into the visible activity for its accepted run. */
export function projectAgentCurrentActivity(
    current: AgentCurrentActivity | null,
    event: AgentActivityEvent | AgentCurrentActivity
): AgentCurrentActivity | null {
    const previous = current?.runId === event.runId ? current : null;
    const snapshot = 'runStartedAt' in event;
    const runStartedAt =
        previous?.runStartedAt ??
        (snapshot ? event.runStartedAt : null) ??
        (event.producer === 'server' &&
        event.category === 'starting_work' &&
        event.phase === 'started'
            ? event.occurredAt
            : null);
    if (isAgentCurrentActivityTerminalEvent(event)) {
        return null;
    }
    const delegations = projectActiveDelegations(
        snapshot ? (event.activeDelegations ?? []) : (previous?.activeDelegations ?? []),
        event
    );
    const project = (activity: AgentActivityEvent): AgentCurrentActivity => {
        const { activeDelegations: _replaced, ...rest } = activity as AgentCurrentActivity;
        return {
            ...rest,
            ...(delegations.length > 0 ? { activeDelegations: delegations } : {}),
            runStartedAt,
        };
    };
    // A noticed message is history, not work: it never displaces what the Agent is doing.
    if (event.category === 'received_message') {
        return previous;
    }
    if (previous && isAgentFinishingActivityEvent(previous) && event.phase !== 'started') {
        return project(previous);
    }
    if (event.phase === 'started' || isAgentFinishingActivityEvent(event)) {
        return project(event);
    }
    // A settled operation falls back to the sub-agents still running, else to plain work.
    return previous
        ? project({
              ...event,
              category: delegations.length > 0 ? 'delegating' : 'working',
              phase: 'started',
          })
        : null;
}

/** Adds a started sub-agent and drops a settled one; at most the first sixteen are listed. */
function projectActiveDelegations(
    delegations: readonly AgentActiveDelegation[],
    event: AgentActivityEvent
): AgentActiveDelegation[] {
    const { operationId } = event;
    if (event.category !== 'delegating' || !operationId) {
        return [...delegations];
    }
    const others = delegations.filter((delegation) => delegation.operationId !== operationId);
    if (event.phase !== 'started') {
        return others;
    }
    const existing = delegations.find((delegation) => delegation.operationId === operationId);
    if (existing || delegations.length >= AGENT_ACTIVE_DELEGATIONS_MAX) {
        return [...delegations];
    }
    return [...delegations, { operationId, startedAt: event.occurredAt }];
}

export function isAgentCurrentActivityTerminalEvent(event: AgentActivityEvent) {
    return event.producer === 'server' && event.category === 'working' && event.phase !== 'started';
}

export function isAgentFinishingActivityEvent(event: AgentActivityEvent) {
    return (
        event.producer === 'server' &&
        event.category === 'sending_message' &&
        event.phase === 'completed'
    );
}

export const agentActivityCursorSchema = z
    .object({
        position: positiveSequenceSchema,
        runId: idSchema,
    })
    .strict();

export type AgentActivityCursor = z.infer<typeof agentActivityCursorSchema>;

export const agentActivityHistoryInputSchema = z
    .object({
        agentId: idSchema,
        before: agentActivityCursorSchema.optional(),
        limit: z.number().int().positive().max(100).default(50),
        runId: idSchema.optional(),
        serverId: idSchema,
    })
    .strict()
    .superRefine((input, context) => {
        if (input.before && input.runId && input.before.runId !== input.runId) {
            context.addIssue({
                code: 'custom',
                message: 'The activity cursor must belong to the requested run.',
                path: ['before', 'runId'],
            });
        }
    });

export type AgentActivityHistoryInput = z.infer<typeof agentActivityHistoryInputSchema>;

/**
 * `runTriggers` names what woke each run on the page, gated and quoted exactly
 * as `agent.turns` does, so a run still working is titled in the same read.
 */
export const agentActivityHistoryPageSchema = z
    .object({
        events: z.array(agentActivityEventSchema),
        nextBefore: agentActivityCursorSchema.nullable(),
        runTriggers: z.array(agentRunTriggerEntrySchema),
    })
    .strict();

export type AgentActivityHistoryPage = z.infer<typeof agentActivityHistoryPageSchema>;

export const agentActiveActivityInputSchema = z.object({ serverId: idSchema }).strict();

export const agentActiveActivitySnapshotSchema = z
    .object({ activities: z.array(agentCurrentActivitySchema) })
    .strict();

export type AgentActiveActivitySnapshot = z.infer<typeof agentActiveActivitySnapshotSchema>;

export const agentActivitySubscriptionInputSchema = z.object({ serverId: idSchema }).strict();
