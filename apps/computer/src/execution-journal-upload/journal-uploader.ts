/**
 * Syncs every run's execution journal to the attached Server (ADR 0048).
 *
 * A live run's records leave as the journal writes them. Each frame waits for
 * the Server's ack and is resent after a reconnect, so the on-disk journal is
 * the outbox and nothing counts as synced before the Server stored it. A run
 * still unmarked (one a crash or restart dropped, one whose queue overflowed
 * while offline, one whose final ack was lost, or one whose `open` record the
 * uploader never saw) is resent whole from disk on every connect, newest first
 * and one run at a time, so this resend pass never starves live frames.
 */
import { join } from 'node:path';
import {
    type AgentExecutionJournalAck,
    type AgentExecutionJournalRecordsFrame,
    agentExecutionJournalAckSchema,
    EXECUTION_JOURNAL_RETENTION_DAYS,
    type ExecutionJournalDocument,
} from '@haus/api';
import { outlineExecutionJournal } from '../execution-journal-outline.ts';
import {
    type ExecutionJournalSink,
    readComputerExecutionJournal,
} from '../harness/execution-journal.ts';
import type { JournalRecord } from '../harness/execution-journal-records.ts';
import {
    createJournalRecordPresenter,
    type JournalRecordPresenter,
} from './journal-record-presentation.ts';
import { fitRecord, packFrames } from './journal-upload-frames.ts';
import {
    clearJournalSynced,
    listUnsyncedJournals,
    markJournalSynced,
    type UnsyncedJournal,
} from './journal-upload-ledger.ts';
import {
    acknowledgeRunUpload,
    createRunUpload,
    pumpRunUpload,
    queuedRunBytes,
    type RunUpload,
} from './journal-upload-run.ts';

const defaultMaxQueuedBytes = 16 * 1024 * 1024;
/** Frames of a whole-run resend in flight at once, so live frames interleave. */
const resendWindow = 2;
const retentionMs = EXECUTION_JOURNAL_RETENTION_DAYS * 24 * 60 * 60 * 1000;

export interface ExecutionJournalUploaderOptions {
    dataRoot: string;
    /** Secret values this Computer holds; an echo of one is masked exactly. */
    knownSecrets: readonly string[];
    log?: (message: string) => void;
    /** A live run's unacknowledged bytes past this drop, and the run resends once settled. */
    maxQueuedBytes?: number;
    now?: () => number;
    send(frame: AgentExecutionJournalRecordsFrame): boolean;
    serverId: string;
}

export class ExecutionJournalUploader {
    private readonly runs = new Map<string, RunUpload>();
    private online = false;
    private lastSequence = 0;
    private backfill: Promise<void> | null = null;
    private backfillWanted = false;
    private ledger = Promise.resolve();

    constructor(private readonly options: ExecutionJournalUploaderOptions) {}

    /** The sink one run's journal reports its durable writes to. */
    async journalSink(input: {
        agentId: string;
        agentRoot: string;
        runId: string;
    }): Promise<ExecutionJournalSink> {
        const present = await this.presenter(input.agentRoot);
        return {
            written: (records, document) => {
                try {
                    this.written(input, present, records, document);
                } catch (error) {
                    // Sync must never fail the local journal or the turn.
                    this.log(`journal upload of ${input.runId} failed: ${describe(error)}`);
                }
            },
        };
    }

    /** The attachment is ordinary again: resend what is pending, then backfill. */
    connected(): void {
        this.online = true;
        for (const run of this.runs.values()) {
            for (const queued of run.frames) {
                queued.sent = false;
            }
            this.pump(run);
        }
        this.startBackfill();
    }

    disconnected(): void {
        this.online = false;
        for (const run of this.runs.values()) {
            run.idle?.();
        }
    }

    /** Consumes a Server frame when it is a journal ack. */
    receive(frame: unknown): boolean {
        const ack = agentExecutionJournalAckSchema.safeParse(frame);
        if (ack.success) {
            this.acknowledge(ack.data);
        }
        return ack.success;
    }

    acknowledge(ack: AgentExecutionJournalAck): void {
        const key = runKey(ack.agentId, ack.runId);
        const run = this.runs.get(key);
        if (!run) {
            return;
        }
        if (ack.status === 'refused') {
            this.log(`the Server refused journal records of ${ack.runId}`);
        }
        const settlesAt = run.settlesAt;
        if (!acknowledgeRunUpload(run, ack) || settlesAt === null) {
            this.pump(run);
            return;
        }
        this.runs.delete(key);
        this.updateLedger(() => markJournalSynced(run.agentRoot, run.runId, settlesAt));
        run.idle?.();
    }

    /** Settles once no backfill pass is running. */
    async drained(): Promise<void> {
        while (this.backfill) {
            await this.backfill;
        }
        await this.ledger;
    }

    private written(
        input: { agentId: string; agentRoot: string; runId: string },
        present: JournalRecordPresenter,
        records: readonly JournalRecord[],
        document: ExecutionJournalDocument
    ): void {
        const key = runKey(input.agentId, input.runId);
        const opens = records[0]?.type === 'open';
        let run = this.runs.get(key);
        if (opens || !run) {
            run?.idle?.();
            this.updateLedger(() => clearJournalSynced(input.agentRoot, input.runId));
            run = createRunUpload(
                { ...input, runStartedAt: document.startedAt },
                { live: true, resendWhole: !opens, window: Number.POSITIVE_INFINITY }
            );
            this.runs.set(key, run);
        }
        const finishing = records.some((record) => record.type === 'finish');
        run.live = !finishing;
        if (!run.resendWhole) {
            const outline = finishing ? outlineExecutionJournal(document) : undefined;
            this.enqueue(run, records.flatMap(present), outline, finishing);
        }
        if (run.resendWhole && finishing) {
            this.runs.delete(key);
            this.startBackfill();
        }
    }

    private enqueue(
        run: RunUpload,
        records: ReturnType<JournalRecordPresenter>,
        outline: AgentExecutionJournalRecordsFrame['outline'],
        settles: boolean
    ): void {
        const sequenced = records.map((record) => ({
            ...fitRecord(record),
            sequence: this.nextSequence(),
        }));
        const frames = packFrames({ ...run, outline, records: sequenced });
        run.frames.push(...frames.map((queued) => ({ ...queued, sent: false })));
        if (settles) {
            run.settlesAt = sequenced.at(-1)?.sequence ?? null;
        }
        if (
            run.live &&
            queuedRunBytes(run) > (this.options.maxQueuedBytes ?? defaultMaxQueuedBytes)
        ) {
            run.frames = [];
            run.resendWhole = true;
            this.log(`journal upload of ${run.runId} overflowed; it resends once settled`);
            return;
        }
        this.pump(run);
    }

    private pump(run: RunUpload): void {
        this.online &&= pumpRunUpload(run, (frame) => this.options.send(frame));
    }

    private startBackfill(): void {
        if (!this.online) {
            return;
        }
        if (this.backfill) {
            this.backfillWanted = true;
            return;
        }
        this.backfill = this.runBackfill()
            .catch((error) => this.log(`journal backfill failed: ${describe(error)}`))
            .finally(() => {
                this.backfill = null;
                if (this.backfillWanted) {
                    this.backfillWanted = false;
                    this.startBackfill();
                }
            });
    }

    private async runBackfill(): Promise<void> {
        await this.ledger;
        const journals = await listUnsyncedJournals({
            serverRoot: join(this.options.dataRoot, 'servers', this.options.serverId),
            since: this.now() - retentionMs,
        });
        for (const journal of journals) {
            if (!this.online) {
                return;
            }
            await this.resend(journal);
        }
    }

    /** Uploads one run whole from disk and waits until the Server stored it. */
    private async resend(journal: UnsyncedJournal): Promise<void> {
        const key = runKey(journal.agentId, journal.runId);
        const document = this.runs.has(key)
            ? null
            : await readComputerExecutionJournal(journal.agentRoot, journal.runId);
        if (!document || this.runs.has(key)) {
            return;
        }
        const present = await this.presenter(journal.agentRoot);
        const run = createRunUpload(
            { ...journal, runStartedAt: document.startedAt },
            { live: false, resendWhole: false, window: resendWindow }
        );
        const idle = new Promise<void>((resolve) => {
            run.idle = resolve;
        });
        this.runs.set(key, run);
        const outline = outlineExecutionJournal(document);
        this.enqueue(run, present({ document, type: 'open' }), outline, true);
        await idle;
    }

    private presenter(agentRoot: string): Promise<JournalRecordPresenter> {
        return createJournalRecordPresenter({ agentRoot, knownSecrets: this.options.knownSecrets });
    }

    /** Marks change in call order, so a stale mark never lands after a newer clear. */
    private updateLedger(change: () => Promise<void>): void {
        this.ledger = this.ledger
            .then(change)
            .catch((error) => this.log(`journal sync mark failed: ${describe(error)}`));
    }

    /** Microsecond wall time, never repeating, so a later process sequences higher. */
    private nextSequence(): number {
        this.lastSequence = Math.max(this.lastSequence + 1, this.now() * 1000);
        return this.lastSequence;
    }

    private now(): number {
        return (this.options.now ?? Date.now)();
    }

    private log(message: string): void {
        (this.options.log ?? console.error)(`[haus] ${message}`);
    }
}

function runKey(agentId: string, runId: string): string {
    return `${agentId}/${runId}`;
}

function describe(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}
