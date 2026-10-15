/**
 * The append-only record log a live turn writes, and the pure replay that turns
 * it back into a document.
 *
 * Rewriting the whole journal on every tool call costs O(turn²) bytes once tool
 * outputs are real, so a running turn appends one small record per mutation and
 * only the finished turn is written as a consolidated snapshot. Every mutation
 * goes through the shared `@haus/api` appliers, so replaying a log here or the
 * uploaded records on the Server reproduces the in-memory document exactly.
 */
import {
    applyExecutionJournalMutation,
    type ExecutionJournalDocument,
    type ExecutionJournalMutation,
} from '@haus/api';

/** The log's first record: the document state the turn resumed or started from. */
export interface JournalOpenRecord {
    document: ExecutionJournalDocument;
    type: 'open';
}

export type JournalRecord = ExecutionJournalMutation | JournalOpenRecord;

export function serializeJournalRecord(record: JournalRecord): string {
    return JSON.stringify(record);
}

/**
 * Rebuilds the document a log describes. A trailing line that fails to parse is
 * a torn final append and is ignored; a corrupt line anywhere earlier is a real
 * defect and is raised rather than silently dropping later evidence.
 */
export function replayJournalRecords(lines: string[]): ExecutionJournalDocument | null {
    const records = parseJournalRecords(lines);
    const [first, ...rest] = records;
    if (first?.type !== 'open') {
        return null;
    }
    const document = first.document;
    for (const record of rest) {
        if (record.type !== 'open') {
            applyExecutionJournalMutation(document, record);
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
