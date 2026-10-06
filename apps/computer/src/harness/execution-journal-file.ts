import { EXECUTION_JOURNAL_REASONING_MAX_CHARS } from '@haus/api';
import { applyJournalRecord, findJournalReasoning } from './execution-journal-mutations';
import type { JournalMutationRecord } from './execution-journal-records';
import {
    appendExecutionJournalRecords,
    writeExecutionJournalSnapshot,
} from './execution-journal-store';
import type {
    ComputerExecutionJournal,
    ComputerExecutionJournalDocument,
    ComputerExecutionJournalStatus,
    ComputerExecutionJournalSubagentPatch,
} from './execution-journal-types';
import { journalValue } from './execution-journal-values';

/**
 * The in-memory document stays the source of truth for the live turn; each
 * mutation also queues one log record, so a crash mid-turn loses nothing and no
 * write is larger than the mutation that caused it.
 */
export class FileExecutionJournal implements ComputerExecutionJournal {
    private writeChain = Promise.resolve();
    private pending: JournalMutationRecord[] = [];

    constructor(
        readonly path: string,
        private readonly document: ComputerExecutionJournalDocument,
        private readonly now: () => Date
    ) {}

    async recordToolCall(input: {
        input?: unknown;
        nativeName?: string;
        occurredAt?: string;
        parentToolCallId?: string;
        toolCallId: string;
        toolName: string;
    }): Promise<void> {
        if (!(input.toolCallId && input.toolName)) {
            return;
        }
        this.push({
            input: input.input === undefined ? undefined : journalValue(input.input),
            nativeName: input.nativeName,
            occurredAt: input.occurredAt ?? this.now().toISOString(),
            ...(input.parentToolCallId ? { parentToolCallId: input.parentToolCallId } : {}),
            toolCallId: input.toolCallId,
            toolName: input.toolName,
            type: 'tool-call',
        });
        await this.flush();
    }

    async recordToolResult(input: {
        isError: boolean;
        nativeName?: string;
        occurredAt?: string;
        output?: unknown;
        preliminary: boolean;
        toolCallId: string;
        toolName: string;
    }): Promise<void> {
        if (!(input.toolCallId && input.toolName)) {
            return;
        }
        this.push({
            isError: input.isError,
            nativeName: input.nativeName,
            occurredAt: input.occurredAt ?? this.now().toISOString(),
            output: journalValue(input.output),
            preliminary: input.preliminary,
            toolCallId: input.toolCallId,
            toolName: input.toolName,
            type: 'tool-result',
        });
        await this.flush();
    }

    async recordSubagent(input: {
        occurredAt?: string;
        patch: ComputerExecutionJournalSubagentPatch;
        toolCallId: string;
    }): Promise<void> {
        this.push({
            occurredAt: input.occurredAt ?? this.now().toISOString(),
            patch: input.patch,
            toolCallId: input.toolCallId,
            type: 'subagent',
        });
        await this.flush();
    }

    /**
     * Blocks past the contract's ceiling are dropped rather than written: a
     * journal Server cannot parse loses every tool call too, not just the
     * reasoning that overflowed.
     */
    recordReasoningStart(input: { id: string; occurredAt?: string }): void {
        if (!input.id) {
            return;
        }
        this.push({
            id: input.id,
            startedAt: input.occurredAt ?? this.now().toISOString(),
            type: 'reasoning-start',
        });
    }

    appendReasoning(input: { id: string; text: string }): void {
        if (!(input.id && input.text)) {
            return;
        }
        const block = findJournalReasoning(this.document, input.id) ?? this.openReasoning(input.id);
        if (!block) {
            return;
        }
        const room = EXECUTION_JOURNAL_REASONING_MAX_CHARS - block.text.length;
        this.push({
            id: input.id,
            text: room > 0 ? input.text.slice(0, room) : '',
            truncated: input.text.length > room ? true : undefined,
            type: 'reasoning-append',
        });
    }

    async recordReasoningEnd(input: { id: string; occurredAt?: string }): Promise<void> {
        this.push({
            endedAt: input.occurredAt ?? this.now().toISOString(),
            id: input.id,
            type: 'reasoning-end',
        });
        await this.flush();
    }

    async flushReasoning(): Promise<void> {
        await this.flush();
    }

    async finishPending(
        status: Exclude<ComputerExecutionJournalStatus, 'completed' | 'running'>,
        reason: 'stream_abort' | 'stream_error',
        error?: unknown
    ): Promise<void> {
        this.push({
            at: this.now().toISOString(),
            error:
                status === 'failed' ? journalValue(error ?? { code: 'stream_failed' }) : undefined,
            reason,
            status,
            type: 'interrupt',
        });
        await this.flush();
    }

    /** Settles the turn: the log is closed out and replaced by one snapshot. */
    async finish(status: Exclude<ComputerExecutionJournalStatus, 'running'>, error?: unknown) {
        this.push({
            at: this.now().toISOString(),
            error: error === undefined ? undefined : journalValue(error),
            status,
            type: 'finish',
        });
        await this.flush();
        await this.writeSnapshot();
    }

    snapshot(): ComputerExecutionJournalDocument {
        return structuredClone(this.document);
    }

    /**
     * Applies the record to the live document and queues it for the log.
     * Consecutive reasoning deltas for one block coalesce, so a flush writes one
     * record per block rather than one per streamed token.
     */
    private push(record: JournalMutationRecord): void {
        if (!applyJournalRecord(this.document, record)) {
            return;
        }
        const last = this.pending.at(-1);
        if (
            record.type === 'reasoning-append' &&
            last?.type === 'reasoning-append' &&
            last.id === record.id
        ) {
            last.text += record.text;
            last.truncated ||= record.truncated;
            return;
        }
        this.pending.push(record);
    }

    private openReasoning(id: string) {
        this.recordReasoningStart({ id });
        return findJournalReasoning(this.document, id);
    }

    private async flush(): Promise<void> {
        if (this.pending.length === 0) {
            return;
        }
        const records = this.pending;
        this.pending = [];
        await this.enqueueWrite(() => appendExecutionJournalRecords(this.path, records));
    }

    private writeSnapshot(): Promise<void> {
        const serialized = JSON.stringify(this.document);
        return this.enqueueWrite(() => writeExecutionJournalSnapshot(this.path, serialized));
    }

    // Serializes disk writes; the caller still observes the failure through the returned promise.
    private enqueueWrite(task: () => Promise<void>): Promise<void> {
        const write = this.writeChain.then(task);
        this.writeChain = write.catch(() => undefined);
        return write;
    }
}
