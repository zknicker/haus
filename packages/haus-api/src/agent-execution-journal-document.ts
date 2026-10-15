/**
 * The raw execution-journal document a Computer records for one run, and the
 * mutation records that change it. The Computer writes them to its local log and
 * uploads them; the Server replays them into the document it serves.
 */

export type ExecutionJournalValue =
    | boolean
    | null
    | number
    | string
    | { [key: string]: ExecutionJournalValue }
    | ExecutionJournalValue[];

export type ExecutionJournalStatus = 'completed' | 'failed' | 'interrupted' | 'running';

export type ExecutionJournalInterruptReason = 'computer_restart' | 'stream_abort' | 'stream_error';

export interface ExecutionJournalResult {
    error?: ExecutionJournalValue;
    observedAt: string;
    output?: ExecutionJournalValue;
}

/** One model reasoning block observed during a turn. */
export interface ExecutionJournalReasoning {
    endedAt?: string;
    id: string;
    startedAt: string;
    text: string;
    truncated?: boolean;
}

/** The sub-agent a delegating tool call ran. */
export interface ExecutionJournalSubagent {
    endedAt?: string;
    label: string;
    latestAction?: string;
    startedAt: string;
    status: ExecutionJournalStatus;
    subagentType?: string;
    usage?: { durationMs: number; toolUses: number; totalTokens: number };
}

/** One sub-agent observation; a field it omits keeps its recorded value. */
export type ExecutionJournalSubagentPatch = Partial<Omit<ExecutionJournalSubagent, 'endedAt'>> & {
    /** `null` reopens a revived sub-agent. */
    endedAt?: string | null;
};

export interface ExecutionJournalTool {
    durationMs?: number;
    endedAt?: string;
    error?: ExecutionJournalValue;
    final?: ExecutionJournalResult;
    input?: ExecutionJournalValue;
    interruptions?: Array<{ at: string; reason: ExecutionJournalInterruptReason }>;
    nativeName?: string;
    output?: ExecutionJournalValue;
    parentToolCallId?: string;
    preliminary?: ExecutionJournalResult;
    startedAt: string;
    status: ExecutionJournalStatus;
    subagent?: ExecutionJournalSubagent;
    toolCallId: string;
    toolName: string;
}

export interface ExecutionJournalDocument {
    endedAt?: string;
    error?: ExecutionJournalValue;
    reasoning?: ExecutionJournalReasoning[];
    runId: string;
    startedAt: string;
    status: ExecutionJournalStatus;
    tools: ExecutionJournalTool[];
}

/** One change to a run's document, in the order the turn observed it. */
export type ExecutionJournalMutation =
    | {
          input?: ExecutionJournalValue;
          nativeName?: string;
          occurredAt: string;
          parentToolCallId?: string;
          toolCallId: string;
          toolName: string;
          type: 'tool-call';
      }
    | {
          occurredAt: string;
          patch: ExecutionJournalSubagentPatch;
          toolCallId: string;
          type: 'subagent';
      }
    | {
          isError: boolean;
          nativeName?: string;
          occurredAt: string;
          output?: ExecutionJournalValue;
          preliminary: boolean;
          toolCallId: string;
          toolName: string;
          type: 'tool-result';
      }
    | { id: string; startedAt: string; type: 'reasoning-start' }
    | { id: string; text: string; truncated?: boolean; type: 'reasoning-append' }
    | { endedAt: string; id: string; type: 'reasoning-end' }
    | {
          at: string;
          error?: ExecutionJournalValue;
          reason: ExecutionJournalInterruptReason;
          status: 'failed' | 'interrupted';
          type: 'interrupt';
      }
    | {
          at: string;
          error?: ExecutionJournalValue;
          status: Exclude<ExecutionJournalStatus, 'running'>;
          type: 'finish';
      };
