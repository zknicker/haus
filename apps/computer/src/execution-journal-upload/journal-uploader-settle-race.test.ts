import { afterAll, expect, mock, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AgentExecutionJournalRecordsFrame } from '@haus/api';
import { createComputerExecutionJournal } from '../harness/execution-journal.ts';

// The sync mark lands late, as on a slow disk, so a backfill pass lists the run before it.
const ledger = { ...(await import('./journal-upload-ledger.ts')) };
mock.module('./journal-upload-ledger.ts', () => ({
    ...ledger,
    markJournalSynced: async (...args: Parameters<typeof ledger.markJournalSynced>) => {
        await Bun.sleep(200);
        await ledger.markJournalSynced(...args);
    },
}));
const { ExecutionJournalUploader } = await import('./journal-uploader.ts');

const dataRoot = await mkdtemp(join(tmpdir(), 'haus-journal-race-'));
afterAll(async () => {
    mock.restore();
    await rm(dataRoot, { force: true, recursive: true });
});

test('a run the Server stores while a backfill pass is listing is not resent into silence', async () => {
    const sent: AgentExecutionJournalRecordsFrame[] = [];
    let accepting = false;
    const uploader = new ExecutionJournalUploader({
        dataRoot,
        knownSecrets: [],
        log: () => undefined,
        send: (frame) => {
            if (accepting) {
                sent.push(structuredClone(frame));
            }
            return accepting;
        },
        serverId: 'srv_race',
    });
    const agentRoot = join(dataRoot, 'servers', 'srv_race', 'agents', 'agt_race');
    const journal = await createComputerExecutionJournal(
        { agentRoot, runId: 'run_race' },
        await uploader.journalSink({ agentId: 'agt_race', agentRoot, runId: 'run_race' })
    );
    await journal.recordToolCall({ toolCallId: 'one', toolName: 'bash' });
    await journal.finish('completed');

    accepting = true;
    uploader.connected();
    for (const frame of sent.splice(0)) {
        uploader.acknowledge({
            agentId: frame.agentId,
            runId: frame.runId,
            status: 'stored',
            throughSequence: frame.records.at(-1)?.sequence ?? 0,
            type: 'agent-execution-journal-ack',
        });
    }

    const settled = await Promise.race([
        uploader.drained().then(() => 'drained'),
        Bun.sleep(2000).then(() => 'stuck'),
    ]);
    expect(settled).toBe('drained');
    expect(sent).toEqual([]);
});
