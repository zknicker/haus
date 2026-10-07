/**
 * The execution-outline contract: a compact, bounded skeleton of one run's
 * Computer-local execution journal. An outline names each step's kind, a short
 * scrubbed label, its place in the run's tree, and its timing, and never carries
 * command output, message bodies, reports, reasoning text, images, or tool
 * inputs. Like the journal, it travels only in the response to an explicit
 * Owner/Admin request and never reaches the Server's store.
 */
import * as z from 'zod';
import { agentExecutionJournalRequestSchema } from './agent-execution-journal.ts';
import { idSchema } from './chat.ts';

const timestampSchema = z.iso.datetime({ offset: true });

/** The most steps one outline keeps; top-level steps are kept first. */
export const EXECUTION_OUTLINE_MAX_STEPS = 200;
/** The longest step or sub-agent label an outline keeps. */
export const EXECUTION_OUTLINE_LABEL_MAX_CHARS = 96;
/** The most runs one outlines request may name. */
export const EXECUTION_OUTLINES_MAX_RUNS = 50;

/**
 * What a step was: a tool call, Haus bookkeeping (a `haus` CLI call or harness
 * compaction), a model reasoning block, or a delegating call that ran a sub-agent.
 */
export const executionOutlineStepKindSchema = z.enum([
    'bookkeeping',
    'reasoning',
    'subagent',
    'tool',
]);

export type AgentExecutionOutlineStepKind = z.infer<typeof executionOutlineStepKindSchema>;

const executionOutlineStepSchema = z
    .object({
        /** Nesting under sub-agents; top-level steps are 0. */
        depth: z.number().int().nonnegative().max(16),
        /** Absent while the step is still running. */
        durationMs: z.number().int().nonnegative().safe().optional(),
        id: z.string().trim().min(1).max(256),
        kind: executionOutlineStepKindSchema,
        label: z.string().max(EXECUTION_OUTLINE_LABEL_MAX_CHARS),
        /** The delegating step whose sub-agent made this one. */
        parentId: z.string().trim().min(1).max(256).optional(),
        /** Offset from the outline's `startedAt`. */
        startOffsetMs: z.number().int().nonnegative().safe(),
        status: z.enum(['completed', 'failed', 'interrupted', 'running']),
        subagent: z
            .object({
                failedToolCount: z.number().int().nonnegative().safe(),
                label: z.string().max(EXECUTION_OUTLINE_LABEL_MAX_CHARS),
            })
            .strict()
            .optional(),
    })
    .strict();

export type AgentExecutionOutlineStep = z.infer<typeof executionOutlineStepSchema>;

export const agentExecutionOutlineSchema = z
    .object({
        /** From `startedAt` to the run's end, or to its latest evidence while it runs. */
        durationMs: z.number().int().nonnegative().safe(),
        /** Steps beyond {@link EXECUTION_OUTLINE_MAX_STEPS} that the outline left out. */
        omittedSteps: z.number().int().positive().safe().optional(),
        runId: idSchema,
        /** The run's earliest evidence: its recorded start, or an earlier step. */
        startedAt: timestampSchema,
        status: z.enum(['completed', 'failed', 'interrupted', 'running']),
        steps: z.array(executionOutlineStepSchema).max(EXECUTION_OUTLINE_MAX_STEPS),
    })
    .strict();

export type AgentExecutionOutline = z.infer<typeof agentExecutionOutlineSchema>;

/** One requested run's answer: its outline, or why there is none. */
export const agentExecutionOutlineEntrySchema = z.discriminatedUnion('status', [
    z
        .object({
            outline: agentExecutionOutlineSchema,
            runId: idSchema,
            status: z.literal('available'),
        })
        .strict()
        .refine((value) => value.outline.runId === value.runId, {
            message: 'The execution outline must belong to its run.',
            path: ['outline', 'runId'],
        }),
    z
        .object({
            reason: z.enum(['missing', 'offline', 'timeout']),
            runId: idSchema,
            status: z.literal('unavailable'),
        })
        .strict(),
]);

export type AgentExecutionOutlineEntry = z.infer<typeof agentExecutionOutlineEntrySchema>;

const outlineRunIdsSchema = z
    .array(idSchema)
    .min(1)
    .max(EXECUTION_OUTLINES_MAX_RUNS)
    .refine((runIds) => new Set(runIds).size === runIds.length, {
        message: 'Run ids must be unique.',
    });

/** Server to Computer: outline these runs of one Agent in one round trip. */
export const agentExecutionOutlinesRequestSchema = z
    .object({
        agentId: idSchema,
        requestId: idSchema,
        runIds: outlineRunIdsSchema,
        type: z.literal('agent-execution-outlines-request'),
    })
    .strict();

export type AgentExecutionOutlinesRequest = z.infer<typeof agentExecutionOutlinesRequestSchema>;

/** The Owner/Admin evidence reads a Server sends down a Computer attachment. */
export const executionEvidenceRequestSchemas = [
    agentExecutionJournalRequestSchema,
    agentExecutionOutlinesRequestSchema,
] as const;

/** Computer to Server: one entry per requested run, in request order. */
export const agentExecutionOutlinesResultSchema = z
    .object({
        agentId: idSchema,
        outlines: z.array(agentExecutionOutlineEntrySchema).max(EXECUTION_OUTLINES_MAX_RUNS),
        requestId: idSchema,
        type: z.literal('agent-execution-outlines-result'),
    })
    .strict();

export type AgentExecutionOutlinesResult = z.infer<typeof agentExecutionOutlinesResultSchema>;

/** The hosted `agent.executionOutlines` query: Owner/Admin only, like the journal. */
export const agentExecutionOutlinesInputSchema = z
    .object({ agentId: idSchema, runIds: outlineRunIdsSchema, serverId: idSchema })
    .strict();

export type AgentExecutionOutlinesInput = z.infer<typeof agentExecutionOutlinesInputSchema>;

export const agentExecutionOutlinesSchema = z
    .object({
        outlines: z.array(agentExecutionOutlineEntrySchema).max(EXECUTION_OUTLINES_MAX_RUNS),
    })
    .strict();

export type AgentExecutionOutlines = z.infer<typeof agentExecutionOutlinesSchema>;
