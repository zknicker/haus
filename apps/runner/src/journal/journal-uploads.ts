import { join } from 'node:path';
import {
    type AgentExecutionJournalAck,
    type AgentExecutionJournalRecordsFrame,
    EXECUTION_JOURNAL_RETENTION_DAYS,
    computerKnownSecrets,
} from '@haus/api';
import { outlineExecutionJournal } from '@haus/computer/src/execution-journal-outline.ts';
import { ExecutionJournalUploader, pruneSyncedJournals } from '@haus/execution-journal';

const journalRetentionMs = EXECUTION_JOURNAL_RETENTION_DAYS * 24 * 60 * 60 * 1000;

type LiveSend = (frame: AgentExecutionJournalRecordsFrame) => boolean;

export type JournalUploads = ReturnType<typeof createJournalUploads>;

export function createJournalUploads(input: {
    dataDir: string;
    environment: Record<string, string | undefined>;
    log: (line: string) => void;
    now?: () => number;
    runnerToken: string;
}) {
    let live: LiveSend | null = null;
    const agentsDir = join(input.dataDir, 'agents');
    const uploader = new ExecutionJournalUploader({
        agentsDir,
        knownSecrets: computerKnownSecrets(input.runnerToken, input.environment),
        log: input.log,
        outline: outlineExecutionJournal,
        send: (frame) => live?.(frame) ?? false,
    });
    let pruning: Promise<void> | null = null;
    const prune = () => {
        pruning ??= pruneSyncedJournals({
            agentsDir,
            before: (input.now ?? Date.now)() - journalRetentionMs,
        })
            .catch((error: unknown) =>
                input.log(`Runner could not prune uploaded journals: ${String(error)}`)
            )
            .finally(() => {
                pruning = null;
            });
    };
    return {
        acknowledge(ack: AgentExecutionJournalAck) {
            uploader.acknowledge(ack);
            if (ack.status !== 'refused') {
                prune();
            }
        },
        connected(send: LiveSend) {
            live = send;
            uploader.connected();
            prune();
        },
        disconnected() {
            live = null;
            uploader.disconnected();
        },
        drained: () => uploader.drained(),
        pruned: () => pruning ?? Promise.resolve(),
        sink: (run: { agentId: string; agentRoot: string; runId: string }) =>
            uploader.journalSink(run),
    };
}
