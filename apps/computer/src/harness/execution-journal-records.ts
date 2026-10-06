/**
 * The append-only record log a live turn writes, and the pure replay that turns
 * it back into a document.
 *
 * Rewriting the whole journal on every tool call costs O(turn²) bytes once tool
 * outputs are real, so a running turn appends one small record per mutation and
 * only the finished turn is written as a consolidated snapshot. Every mutation
 * the journal performs goes through the shared appliers, so replaying a log
 * reproduces the in-memory document exactly.
 */
import { applyJournalRecord } from './execution-journal-mutations';
import type {
    ComputerExecutionJournalDocument,
    ComputerExecutionJournalStatus,
    ComputerExecutionJournalSubagentPatch,
    JournalValue,
} from './execution-journal-types';

export type JournalInterruptReason = 'computer_restart' | 'stream_abort' | 'stream_error';

export type JournalMutationRecord =
    | {
          input?: JournalValue;
          nativeName?: string;
          occurredAt: string;
          parentToolCallId?: string;
          toolCallId: string;
          toolName: string;
          type: 'tool-call';
      }
    | {
          occurredAt: string;
          patch: ComputerExecutionJournalSubagentPatch;
          toolCallId: string;
          type: 'subagent';
      }
    | {
          isError: boolean;
          nativeName?: string;
          occurredAt: string;
          output?: JournalValue;
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
          error?: JournalValue;
          reason: JournalInterruptReason;
          status: 'failed' | 'interrupted';
          type: 'interrupt';
      }
    | {
          at: string;
          error?: JournalValue;
          status: Exclude<ComputerExecutionJournalStatus, 'running'>;
          type: 'finish';
      };

/** The log's first record: the document state the turn resumed or started from. */
export interface JournalOpenRecord {
    document: ComputerExecutionJournalDocument;
    type: 'open';
}

export type JournalRecord = JournalMutationRecord | JournalOpenRecord;

export function serializeJournalRecord(record: JournalRecord): string {
    return JSON.stringify(record);
}

/**
 * Rebuilds the document a log describes. A trailing line that fails to parse is
 * a torn final append and is ignored; a corrupt line anywhere earlier is a real
 * defect and is raised rather than silently dropping later evidence.
 */
export function replayJournalRecords(lines: string[]): ComputerExecutionJournalDocument | null {
    const records = parseJournalRecords(lines);
    const [first, ...rest] = records;
    if (first?.type !== 'open') {
        return null;
    }
    const document = first.document;
    for (const record of rest) {
        if (record.type !== 'open') {
            applyJournalRecord(document, record);
        }
    }
    return document;
}

function parseJournalRecords(lines: string[]): JournalRecord[] {
    const present = lines.filter((line) => line.length > 0);
    const records: JournalRecord[] = [];
    for (const [index, line] of present.entries()) {
        try {
            records.push(JSON.parse(line) as JournalRecord);
        } catch (cause) {
            if (index === present.length - 1) {
                break;
            }
            throw new Error('The execution journal log holds a corrupt record.', { cause });
        }
    }
    return records;
}
