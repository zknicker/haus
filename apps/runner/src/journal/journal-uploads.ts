import { join } from 'node:path';
import {
    type AgentExecutionJournalAck,
    type AgentExecutionJournalRecordsFrame,
    EXECUTION_JOURNAL_RETENTION_DAYS,
} from '@haus/api';
import { computerKnownSecrets } from '@haus/computer/src/execution-journal-upload/journal-redaction.ts';
import { pruneSyncedJournals } from '@haus/computer/src/execution-journal-upload/journal-upload-ledger.ts';
import { ExecutionJournalUploader } from '@haus/computer/src/execution-journal-upload/journal-uploader.ts';

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
        send: (frame) => live?.(frame) ?? false,
    });
    return {
        acknowledge(ack: AgentExecutionJournalAck) {
            uploader.acknowledge(ack);
        },
        connected(send: LiveSend) {
            live = send;
            uploader.connected();
            void pruneSyncedJournals({
                agentsDir,
                before: (input.now ?? Date.now)() - journalRetentionMs,
            }).catch((error: unknown) =>
                input.log(`Runner could not prune uploaded journals: ${String(error)}`)
            );
        },
        disconnected() {
            live = null;
            uploader.disconnected();
        },
        drained: () => uploader.drained(),
        sink: (run: { agentId: string; agentRoot: string; runId: string }) =>
            uploader.journalSink(run),
    };
}
