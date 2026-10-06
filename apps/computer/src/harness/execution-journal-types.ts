export type JournalValue =
    | boolean
    | null
    | number
    | string
    | { [key: string]: JournalValue }
    | JournalValue[];

export type ComputerExecutionJournalStatus = 'completed' | 'failed' | 'interrupted' | 'running';

export interface ComputerExecutionJournalResult {
    error?: JournalValue;
    observedAt: string;
    output?: JournalValue;
}

/** One model reasoning block observed during a turn. Computer-local evidence. */
export interface ComputerExecutionJournalReasoning {
    endedAt?: string;
    id: string;
    startedAt: string;
    text: string;
    truncated?: boolean;
}

/** The sub-agent a delegating tool call ran; Computer-local evidence. */
export interface ComputerExecutionJournalSubagent {
    endedAt?: string;
    label: string;
    latestAction?: string;
    startedAt: string;
    status: ComputerExecutionJournalStatus;
    subagentType?: string;
    usage?: { durationMs: number; toolUses: number; totalTokens: number };
}

/** One sub-agent observation; a field it omits keeps its recorded value. */
export type ComputerExecutionJournalSubagentPatch = Partial<
    Omit<ComputerExecutionJournalSubagent, 'endedAt'>
> & {
    /** `null` reopens a revived sub-agent. */
    endedAt?: string | null;
};

export interface ComputerExecutionJournalTool {
    durationMs?: number;
    endedAt?: string;
    error?: JournalValue;
    final?: ComputerExecutionJournalResult;
    input?: JournalValue;
    interruptions?: Array<{
        at: string;
        reason: 'computer_restart' | 'stream_abort' | 'stream_error';
    }>;
    nativeName?: string;
    output?: JournalValue;
    parentToolCallId?: string;
    preliminary?: ComputerExecutionJournalResult;
    startedAt: string;
    status: ComputerExecutionJournalStatus;
    subagent?: ComputerExecutionJournalSubagent;
    toolCallId: string;
    toolName: string;
}

export interface ComputerExecutionJournalDocument {
    endedAt?: string;
    error?: JournalValue;
    reasoning?: ComputerExecutionJournalReasoning[];
    runId: string;
    startedAt: string;
    status: ComputerExecutionJournalStatus;
    tools: ComputerExecutionJournalTool[];
}

export interface ComputerExecutionJournal {
    /** Buffers a reasoning delta in memory; the next persist writes it. */
    appendReasoning(input: { id: string; text: string }): void;
    finish(
        status: Exclude<ComputerExecutionJournalStatus, 'running'>,
        error?: unknown
    ): Promise<void>;
    finishPending(
        status: Exclude<ComputerExecutionJournalStatus, 'completed' | 'running'>,
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
        patch: ComputerExecutionJournalSubagentPatch;
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
    snapshot(): ComputerExecutionJournalDocument;
}
