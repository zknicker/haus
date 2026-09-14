import * as z from 'zod';
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
    'thinking',
    'updating_instructions',
    'browsing',
    'searching_web',
    'reading_files',
    'editing_files',
    'running_command',
    'using_tool',
    'sending_message',
    'working',
]);

export type AgentActivityCategory = z.infer<typeof agentActivityCategorySchema>;

export const agentActivityPhaseSchema = z.enum(['started', 'completed', 'failed', 'interrupted']);
export type AgentActivityPhase = z.infer<typeof agentActivityPhaseSchema>;

export const agentTurnOperationCategorySchema = agentActivityCategorySchema.exclude([
    'sending_message',
    'starting_work',
    'thinking',
    'working',
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
        operations: z.array(agentTurnOperationCountSchema).max(8),
    })
    .strict()
    .refine(
        (summary) =>
            new Set(summary.operations.map((operation) => operation.category)).size ===
            summary.operations.length,
        { message: 'Operation categories must be unique.' }
    );

export type AgentTurnActivitySummary = z.infer<typeof agentTurnActivitySummarySchema>;

export const agentActivityProducerSchema = z.enum(['server', 'computer']);
export type AgentActivityProducer = z.infer<typeof agentActivityProducerSchema>;

/** The only activity frame a Computer may submit to the Server. */
export const agentActivityFrameSchema = z
    .object({
        agentId: idSchema,
        category: agentActivityCategorySchema,
        occurredAt: timestampSchema,
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
    runStartedAt: timestampSchema.nullable(),
});
export type AgentCurrentActivity = z.infer<typeof agentCurrentActivitySchema>;

/** Projects one journal event into the visible activity for its accepted run. */
export function projectAgentCurrentActivity(
    current: AgentCurrentActivity | null,
    event: AgentActivityEvent | AgentCurrentActivity
): AgentCurrentActivity | null {
    const previous = current?.runId === event.runId ? current : null;
    const runStartedAt =
        previous?.runStartedAt ??
        ('runStartedAt' in event ? event.runStartedAt : null) ??
        (event.producer === 'server' &&
        event.category === 'starting_work' &&
        event.phase === 'started'
            ? event.occurredAt
            : null);
    if (isAgentCurrentActivityTerminalEvent(event)) {
        return null;
    }
    if (previous && isAgentFinishingActivityEvent(previous) && event.phase !== 'started') {
        return previous;
    }
    if (event.phase === 'started') {
        return { ...event, runStartedAt };
    }
    if (isAgentFinishingActivityEvent(event)) {
        return { ...event, runStartedAt };
    }
    return previous ? { ...event, category: 'working', phase: 'started', runStartedAt } : null;
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

export const agentActivityHistoryPageSchema = z
    .object({
        events: z.array(agentActivityEventSchema),
        nextBefore: agentActivityCursorSchema.nullable(),
    })
    .strict();

export type AgentActivityHistoryPage = z.infer<typeof agentActivityHistoryPageSchema>;

export const agentActiveActivityInputSchema = z.object({ serverId: idSchema }).strict();

export const agentActiveActivitySnapshotSchema = z
    .object({ activities: z.array(agentCurrentActivitySchema) })
    .strict();

export type AgentActiveActivitySnapshot = z.infer<typeof agentActiveActivitySnapshotSchema>;

export const agentActivitySubscriptionInputSchema = z.object({ serverId: idSchema }).strict();
