/**
 * How a Computer syncs each run's execution journal to the Server (ADR 0048).
 *
 * The Computer sends a run's records in `agent-execution-journal-records`
 * frames as the turn writes them, each record under a per-run sequence that
 * only grows. An `open` record replaces everything before it: it starts a run,
 * resumes one after a restart, or resends a whole settled run, followed by one
 * `tool` and one `reasoning` record per element so no frame outgrows the cap.
 * The Server stores every record idempotently and answers each frame with an
 * `agent-execution-journal-ack` naming the frame's last sequence.
 */
import * as z from 'zod';
import {
    EXECUTION_JOURNAL_REASONING_MAX_BLOCKS,
    executionJournalReasoningSchema,
    executionJournalResultSchema,
    executionJournalSubagentSchema,
    executionJournalToolSchema,
} from './agent-execution-journal.ts';
import type {
    ExecutionJournalDocument,
    ExecutionJournalMutation,
    ExecutionJournalReasoning,
    ExecutionJournalTool,
} from './agent-execution-journal-document.ts';
import { applyExecutionJournalMutation } from './agent-execution-journal-replay.ts';
import { agentExecutionOutlineSchema } from './agent-execution-outline.ts';
import { idSchema } from './chat.ts';

/** The largest serialized records frame a Computer sends. */
export const EXECUTION_JOURNAL_UPLOAD_FRAME_MAX_BYTES = 1024 * 1024;
/** The most records one frame carries. */
export const EXECUTION_JOURNAL_UPLOAD_MAX_RECORDS = 2000;
/** The Server keeps a run's journal this long after the run started. */
export const EXECUTION_JOURNAL_RETENTION_DAYS = 30;

const timestampSchema = z.iso.datetime({ offset: true });
const valueSchema = z.json();
const statusSchema = z.enum(['completed', 'failed', 'interrupted', 'running']);
const interruptReasonSchema = z.enum(['computer_restart', 'stream_abort', 'stream_error']);
const callIdSchema = z.string().trim().min(1).max(256);

const uploadedResultSchema = executionJournalResultSchema.extend({
    error: valueSchema.optional(),
    output: valueSchema.optional(),
});

/** A raw journal tool: the stored shape, without the fields a reader derives. */
const uploadedToolSchema = executionJournalToolSchema.omit({ failure: true }).extend({
    error: valueSchema.optional(),
    final: uploadedResultSchema.optional(),
    input: valueSchema.optional(),
    output: valueSchema.optional(),
    preliminary: uploadedResultSchema.optional(),
    subagent: executionJournalSubagentSchema.omit({ failedToolCount: true }).optional(),
});

const uploadedDocumentSchema = z
    .object({
        endedAt: timestampSchema.optional(),
        error: valueSchema.optional(),
        reasoning: z
            .array(executionJournalReasoningSchema)
            .max(EXECUTION_JOURNAL_REASONING_MAX_BLOCKS)
            .optional(),
        runId: idSchema,
        startedAt: timestampSchema,
        status: statusSchema,
        tools: z.array(uploadedToolSchema).max(10_000),
    })
    .strict();

const subagentPatchSchema = executionJournalSubagentSchema
    .omit({ endedAt: true, failedToolCount: true })
    .partial()
    .extend({ endedAt: timestampSchema.nullable().optional() });

const mutationSchemas = [
    z
        .object({
            input: valueSchema.optional(),
            nativeName: z.string().max(256).optional(),
            occurredAt: timestampSchema,
            parentToolCallId: callIdSchema.optional(),
            toolCallId: callIdSchema,
            toolName: callIdSchema,
            type: z.literal('tool-call'),
        })
        .strict(),
    z
        .object({
            occurredAt: timestampSchema,
            patch: subagentPatchSchema,
            toolCallId: callIdSchema,
            type: z.literal('subagent'),
        })
        .strict(),
    z
        .object({
            isError: z.boolean(),
            nativeName: z.string().max(256).optional(),
            occurredAt: timestampSchema,
            output: valueSchema.optional(),
            preliminary: z.boolean(),
            toolCallId: callIdSchema,
            toolName: callIdSchema,
            type: z.literal('tool-result'),
        })
        .strict(),
    z
        .object({
            id: callIdSchema,
            startedAt: timestampSchema,
            type: z.literal('reasoning-start'),
        })
        .strict(),
    z
        .object({
            id: callIdSchema,
            text: z.string(),
            truncated: z.boolean().optional(),
            type: z.literal('reasoning-append'),
        })
        .strict(),
    z
        .object({ endedAt: timestampSchema, id: callIdSchema, type: z.literal('reasoning-end') })
        .strict(),
    z
        .object({
            at: timestampSchema,
            error: valueSchema.optional(),
            reason: interruptReasonSchema,
            status: z.enum(['failed', 'interrupted']),
            type: z.literal('interrupt'),
        })
        .strict(),
    z
        .object({
            at: timestampSchema,
            error: valueSchema.optional(),
            status: z.enum(['completed', 'failed', 'interrupted']),
            type: z.literal('finish'),
        })
        .strict(),
] as const;

export const executionJournalUploadRecordSchema = z.discriminatedUnion('type', [
    z.object({ document: uploadedDocumentSchema, type: z.literal('open') }).strict(),
    z.object({ tool: uploadedToolSchema, type: z.literal('tool') }).strict(),
    z.object({ block: executionJournalReasoningSchema, type: z.literal('reasoning') }).strict(),
    ...mutationSchemas,
]);

export type ExecutionJournalUploadRecord =
    | { document: ExecutionJournalDocument; type: 'open' }
    | { tool: ExecutionJournalTool; type: 'tool' }
    | { block: ExecutionJournalReasoning; type: 'reasoning' }
    | ExecutionJournalMutation;

const sequenceSchema = z.number().int().positive().safe();

/** Computer → Server: one run's next records, in sequence order. */
export const agentExecutionJournalRecordsFrameSchema = z
    .object({
        agentId: idSchema,
        /** Present on the frame that settles a run (or resends a settled one). */
        outline: agentExecutionOutlineSchema.optional(),
        /** Records stay unparsed here so one bad record is refused, not the socket. */
        records: z
            .array(z.object({ record: z.unknown(), sequence: sequenceSchema }).strict())
            .min(1)
            .max(EXECUTION_JOURNAL_UPLOAD_MAX_RECORDS),
        runId: idSchema,
        runStartedAt: timestampSchema,
        type: z.literal('agent-execution-journal-records'),
    })
    .strict();

export type AgentExecutionJournalRecordsFrame = Omit<
    z.infer<typeof agentExecutionJournalRecordsFrameSchema>,
    'records'
> & { records: Array<{ record: ExecutionJournalUploadRecord; sequence: number }> };

/**
 * Server → Computer: the frame ending at `throughSequence` was stored, or
 * refused for good (the Agent is not assigned to this Computer, or the frame or
 * a record is malformed). Either answer settles the frame: a refused one is
 * never resent, so it cannot hold up the rest of the run or the resend pass.
 */
export const agentExecutionJournalAckSchema = z
    .object({
        agentId: idSchema,
        runId: idSchema,
        status: z.enum(['refused', 'stored']),
        throughSequence: sequenceSchema,
        type: z.literal('agent-execution-journal-ack'),
    })
    .strict();

export type AgentExecutionJournalAck = z.infer<typeof agentExecutionJournalAckSchema>;

/** Parses one uploaded record; null when it does not match the contract. */
export function parseExecutionJournalUploadRecord(
    value: unknown
): ExecutionJournalUploadRecord | null {
    const parsed = executionJournalUploadRecordSchema.safeParse(value);
    return parsed.success ? (parsed.data as ExecutionJournalUploadRecord) : null;
}

/**
 * Rebuilds a run's document from its stored records in sequence order,
 * starting at the latest `open`. Null when no `open` has arrived yet.
 */
export function replayExecutionJournalUpload(
    records: readonly ExecutionJournalUploadRecord[]
): ExecutionJournalDocument | null {
    let start = records.length - 1;
    while (start >= 0 && records[start]?.type !== 'open') {
        start -= 1;
    }
    const open = records[start];
    if (open?.type !== 'open') {
        return null;
    }
    const document = structuredClone(open.document);
    for (const record of records.slice(start + 1)) {
        if (record.type === 'tool') {
            document.tools.push(structuredClone(record.tool));
        } else if (record.type === 'reasoning') {
            document.reasoning = [...(document.reasoning ?? []), structuredClone(record.block)];
        } else if (record.type !== 'open') {
            applyExecutionJournalMutation(document, record);
        }
    }
    return document;
}
