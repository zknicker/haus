/**
 * Fits presented records into `agent-execution-journal-records` frames under the
 * contract's byte cap. The local journal keeps every byte; only a record that
 * alone outgrows a frame is clipped harder for upload, and says so.
 */
import {
    type AgentExecutionJournalRecordsFrame,
    type AgentExecutionOutline,
    EXECUTION_JOURNAL_UPLOAD_MAX_RECORDS,
    type ExecutionJournalUploadRecord,
} from '@haus/api';

/** Room left for the envelope and an outline (at most ~150 KiB) under the 1 MiB frame cap. */
export const RECORD_BUDGET_BYTES = 768 * 1024;
const clipSteps = [65_536, 16_384, 4096, 1024] as const;
const omitted = '[omitted: this value exceeded the journal upload size]';

export interface SequencedRecord {
    bytes: number;
    record: ExecutionJournalUploadRecord;
    sequence: number;
}

/** The record as uploaded, and its serialized size. */
export function fitRecord(record: ExecutionJournalUploadRecord): {
    bytes: number;
    record: ExecutionJournalUploadRecord;
} {
    let bytes = sizeOf(record);
    if (bytes <= RECORD_BUDGET_BYTES) {
        return { bytes, record };
    }
    for (const cap of clipSteps) {
        const clipped = clipStrings(record, cap) as ExecutionJournalUploadRecord;
        bytes = sizeOf(clipped);
        if (bytes <= RECORD_BUDGET_BYTES) {
            return { bytes, record: clipped };
        }
    }
    const dropped = dropPayload(record);
    return { bytes: sizeOf(dropped), record: dropped };
}

export interface QueuedFrame {
    bytes: number;
    frame: AgentExecutionJournalRecordsFrame;
}

/** Consecutive frames for one run; the outline rides the last one. */
export function packFrames(input: {
    agentId: string;
    outline?: AgentExecutionOutline;
    records: readonly SequencedRecord[];
    runId: string;
    runStartedAt: string;
}): QueuedFrame[] {
    const groups: SequencedRecord[][] = [];
    let current: SequencedRecord[] = [];
    let bytes = 0;
    for (const entry of input.records) {
        if (
            current.length > 0 &&
            (bytes + entry.bytes > RECORD_BUDGET_BYTES ||
                current.length >= EXECUTION_JOURNAL_UPLOAD_MAX_RECORDS)
        ) {
            groups.push(current);
            current = [];
            bytes = 0;
        }
        current.push(entry);
        bytes += entry.bytes;
    }
    if (current.length > 0) {
        groups.push(current);
    }
    return groups.map((group, index) => ({
        bytes: group.reduce((total, entry) => total + entry.bytes, 0),
        frame: {
            agentId: input.agentId,
            ...(input.outline && index === groups.length - 1 ? { outline: input.outline } : {}),
            records: group.map(({ record, sequence }) => ({ record, sequence })),
            runId: input.runId,
            runStartedAt: input.runStartedAt,
            type: 'agent-execution-journal-records',
        },
    }));
}

/** The sequence the Server's ack for this frame names. */
export function frameSequence(frame: AgentExecutionJournalRecordsFrame): number {
    return frame.records.at(-1)?.sequence ?? 0;
}

function sizeOf(value: unknown): number {
    return Buffer.byteLength(JSON.stringify(value), 'utf8') + 32;
}

function clipStrings(value: unknown, cap: number): unknown {
    if (typeof value === 'string') {
        return value.length > cap
            ? `${value.slice(0, cap)}\n…[truncated ${String(value.length - cap)} more characters for upload]`
            : value;
    }
    if (Array.isArray(value)) {
        return value.map((item) => clipStrings(item, cap));
    }
    if (value && typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value).map(([key, item]) => [key, clipStrings(item, cap)])
        );
    }
    return value;
}

/** The last resort for a record with too many fields to clip under the cap. */
function dropPayload(record: ExecutionJournalUploadRecord): ExecutionJournalUploadRecord {
    switch (record.type) {
        case 'tool-call':
            return { ...record, input: omitted };
        case 'tool-result':
            return { ...record, output: omitted };
        case 'tool': {
            const { final, preliminary, ...tool } = record.tool;
            const keep = (result: typeof final) =>
                result && { observedAt: result.observedAt, output: omitted };
            return {
                tool: {
                    ...tool,
                    error: tool.error === undefined ? undefined : omitted,
                    final: keep(final),
                    input: omitted,
                    output: omitted,
                    preliminary: keep(preliminary),
                },
                type: 'tool',
            };
        }
        case 'open':
            return { ...record, document: { ...record.document, error: omitted } };
        case 'interrupt':
        case 'finish':
            return { ...record, error: omitted };
        default:
            return record;
    }
}
