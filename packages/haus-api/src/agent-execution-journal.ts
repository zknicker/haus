/**
 * The execution-journal contract: the Computer-local evidence an Owner or Admin
 * may pull for one agent run. The journal never reaches the Server's store; it
 * travels only in the response to an explicit request.
 */
import * as z from 'zod';
import { idSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });

export const agentExecutionJournalRequestSchema = z
    .object({
        agentId: idSchema,
        requestId: idSchema,
        runId: idSchema,
        type: z.literal('agent-execution-journal-request'),
    })
    .strict();

export type AgentExecutionJournalRequest = z.infer<typeof agentExecutionJournalRequestSchema>;

const executionJournalResultSchema = z
    .object({
        error: z.unknown().optional(),
        observedAt: timestampSchema,
        output: z.unknown().optional(),
    })
    .strict();

/** The longest sub-agent label or latest-action line a journal keeps. */
export const EXECUTION_JOURNAL_SUBAGENT_LABEL_MAX_CHARS = 128;

/**
 * The sub-agent a delegating tool call ran, as the runtime reported it. Rides
 * the parent tool; the sub-agent's own tool calls are sibling tools that name
 * the parent in `parentToolCallId`.
 */
const executionJournalSubagentSchema = z
    .object({
        endedAt: timestampSchema.optional(),
        label: z.string().max(EXECUTION_JOURNAL_SUBAGENT_LABEL_MAX_CHARS),
        latestAction: z.string().max(EXECUTION_JOURNAL_SUBAGENT_LABEL_MAX_CHARS).optional(),
        startedAt: timestampSchema,
        status: z.enum(['completed', 'failed', 'interrupted', 'running']),
        subagentType: z.string().max(EXECUTION_JOURNAL_SUBAGENT_LABEL_MAX_CHARS).optional(),
        usage: z
            .object({
                durationMs: z.number().int().nonnegative().safe(),
                toolUses: z.number().int().nonnegative().safe(),
                totalTokens: z.number().int().nonnegative().safe(),
            })
            .strict()
            .optional(),
    })
    .strict();

export type AgentExecutionJournalSubagent = z.infer<typeof executionJournalSubagentSchema>;

const executionJournalToolSchema = z
    .object({
        durationMs: z.number().int().nonnegative().optional(),
        endedAt: timestampSchema.optional(),
        error: z.unknown().optional(),
        final: executionJournalResultSchema.optional(),
        input: z.unknown().optional(),
        interruptions: z
            .array(
                z
                    .object({
                        at: timestampSchema,
                        reason: z.enum(['computer_restart', 'stream_abort', 'stream_error']),
                    })
                    .strict()
            )
            .max(100)
            .optional(),
        nativeName: z.string().max(256).optional(),
        output: z.unknown().optional(),
        /** The delegating tool call whose sub-agent made this call. */
        parentToolCallId: z.string().trim().min(1).max(256).optional(),
        preliminary: executionJournalResultSchema.optional(),
        startedAt: timestampSchema,
        status: z.enum(['completed', 'failed', 'interrupted', 'running']),
        subagent: executionJournalSubagentSchema.optional(),
        toolCallId: z.string().trim().min(1).max(256),
        toolName: z.string().trim().min(1).max(256),
    })
    .strict();

/**
 * One model reasoning block observed on the Computer during a turn. Reasoning
 * stays Computer-local and reaches the App only through the explicit
 * Owner/Admin execution-journal request; it is never Server-persisted.
 */
export const EXECUTION_JOURNAL_REASONING_MAX_CHARS = 64_000;

/**
 * The Computer must stop opening blocks at this count: a journal that carries
 * more fails this schema on Server, and a failed parse costs the whole run's
 * evidence, not just its reasoning.
 */
export const EXECUTION_JOURNAL_REASONING_MAX_BLOCKS = 1000;

/**
 * Every string leaf a journalled tool input, output, or error carries is capped
 * here. A single 5 MB stdout would otherwise land in the run's file and in the
 * Computer-to-Server relay frame verbatim. A clipped string keeps its first
 * {@link EXECUTION_JOURNAL_VALUE_MAX_CHARS} characters and says how many it
 * dropped. Reasoning text keeps its own, tighter cap.
 */
export const EXECUTION_JOURNAL_VALUE_MAX_CHARS = 256_000;

const executionJournalReasoningSchema = z
    .object({
        endedAt: timestampSchema.optional(),
        id: z.string().trim().min(1).max(256),
        startedAt: timestampSchema,
        text: z.string().max(EXECUTION_JOURNAL_REASONING_MAX_CHARS),
        truncated: z.boolean().optional(),
    })
    .strict();

export type AgentExecutionJournalReasoning = z.infer<typeof executionJournalReasoningSchema>;
export type AgentExecutionJournalTool = z.infer<typeof executionJournalToolSchema>;

export const agentExecutionJournalSchema = z
    .object({
        endedAt: timestampSchema.optional(),
        error: z.unknown().optional(),
        reasoning: z
            .array(executionJournalReasoningSchema)
            .max(EXECUTION_JOURNAL_REASONING_MAX_BLOCKS)
            .optional(),
        runId: idSchema,
        startedAt: timestampSchema,
        status: z.enum(['completed', 'failed', 'interrupted', 'running']),
        tools: z.array(executionJournalToolSchema).max(10_000),
    })
    .strict();

export type AgentExecutionJournal = z.infer<typeof agentExecutionJournalSchema>;

export const agentExecutionJournalResultSchema = z.discriminatedUnion('status', [
    z
        .object({
            agentId: idSchema,
            journal: agentExecutionJournalSchema,
            requestId: idSchema,
            runId: idSchema,
            status: z.literal('available'),
            type: z.literal('agent-execution-journal-result'),
        })
        .strict()
        .refine((value) => value.journal.runId === value.runId, {
            message: 'The execution journal must belong to the requested run.',
            path: ['journal', 'runId'],
        }),
    z
        .object({
            agentId: idSchema,
            reason: z.enum(['missing', 'offline', 'timeout']),
            requestId: idSchema,
            runId: idSchema,
            status: z.literal('unavailable'),
            type: z.literal('agent-execution-journal-result'),
        })
        .strict(),
]);

export type AgentExecutionJournalResult = z.infer<typeof agentExecutionJournalResultSchema>;

export const agentTurnDetailRequestSchema = agentExecutionJournalRequestSchema;
export const agentTurnDetailResultSchema = agentExecutionJournalResultSchema;
