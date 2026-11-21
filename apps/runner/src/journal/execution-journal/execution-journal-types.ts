import type {
    ExecutionJournalDocument,
    ExecutionJournalStatus,
    ExecutionJournalSubagentPatch,
} from '@haus/api';
import type { JournalRecord } from './execution-journal-records.ts';

/**
 * Told about every record the journal durably wrote, in write order, so the
 * run's upload sees exactly what the disk holds. `document` is the live state.
 */
export interface ExecutionJournalSink {
    written(records: readonly JournalRecord[], document: ExecutionJournalDocument): void;
}

export interface ComputerExecutionJournal {
    /** Buffers a reasoning delta in memory; the next persist writes it. */
    appendReasoning(input: { id: string; text: string }): void;
    finish(status: Exclude<ExecutionJournalStatus, 'running'>, error?: unknown): Promise<void>;
    finishPending(
        status: Exclude<ExecutionJournalStatus, 'completed' | 'running'>,
        reason: 'stream_abort' | 'stream_error',
        error?: unknown
    ): Promise<void>;
    /** Persists buffered reasoning deltas that no other write has flushed yet. */
    flushReasoning(): Promise<void>;
    readonly path: string;
    recordReasoningEnd(input: { id: string; occurredAt?: string }): Promise<void>;
    recordReasoningStart(input: { id: string; occurredAt?: string }): void;
    /** Records what the runtime reported about a delegating tool call's sub-agent. */
    recordSubagent(input: {
        occurredAt?: string;
        patch: ExecutionJournalSubagentPatch;
        toolCallId: string;
    }): Promise<void>;
    recordToolCall(input: {
        input?: unknown;
        nativeName?: string;
        occurredAt?: string;
        /** The delegating tool call whose sub-agent made this call. */
        parentToolCallId?: string;
        toolCallId: string;
        toolName: string;
    }): Promise<void>;
    recordToolResult(input: {
        isError: boolean;
        nativeName?: string;
        occurredAt?: string;
        /** The translated stream names the payload `output`, errors included. */
        output?: unknown;
        preliminary: boolean;
        toolCallId: string;
        toolName: string;
    }): Promise<void>;
    snapshot(): ExecutionJournalDocument;
}
