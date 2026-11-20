import { join } from 'node:path';
import type { AgentExecutionJournalAck, AgentExecutionJournalRecordsFrame } from '@haus/api';
import { computerKnownSecrets } from '@haus/computer/src/execution-journal-upload/journal-redaction.ts';
import { ExecutionJournalUploader } from '@haus/computer/src/execution-journal-upload/journal-uploader.ts';

type LiveSend = (frame: AgentExecutionJournalRecordsFrame) => boolean;

export type JournalUploads = ReturnType<typeof createJournalUploads>;

export function createJournalUploads(input: {
    dataDir: string;
    environment: Record<string, string | undefined>;
    log: (line: string) => void;
    runnerToken: string;
}) {
    let live: LiveSend | null = null;
    const uploader = new ExecutionJournalUploader({
        agentsDir: join(input.dataDir, 'agents'),
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
