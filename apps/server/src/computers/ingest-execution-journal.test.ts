import { expect, test } from 'bun:test';
import type { AgentExecutionJournalAck } from '@haus/api';
import type { HausDatabase } from '../postgres/connection.ts';
import { ingestExecutionJournalUpload } from './ingest-execution-journal.ts';

test('a records frame with a malformed envelope is refused, so the Computer moves on', async () => {
    const sent: AgentExecutionJournalAck[] = [];
    const consumed = await ingestExecutionJournalUpload(
        // The envelope is refused before any database work.
        {} as HausDatabase,
        {
            acknowledge: (ack) => sent.push(ack),
            frame: {
                agentId: 'agt_one',
                outline: { runId: 'run_one' },
                records: [{ record: { type: 'open' }, sequence: 7 }],
                runId: 'run_one',
                runStartedAt: '2026-10-14T12:00:00.000Z',
                type: 'agent-execution-journal-records',
            },
            writer: { computerId: 'cmp_one', kind: 'computer', serverId: 'srv_one' },
        }
    );
    expect(consumed).toBe(true);
    expect(sent).toEqual([
        {
            agentId: 'agt_one',
            runId: 'run_one',
            status: 'refused',
            throughSequence: 7,
            type: 'agent-execution-journal-ack',
        },
    ]);
});

test('a frame that is not a journal upload is left for other handlers', async () => {
    const sent: AgentExecutionJournalAck[] = [];
    const consumed = await ingestExecutionJournalUpload({} as HausDatabase, {
        acknowledge: (ack) => sent.push(ack),
        frame: { type: 'agent-activity' },
        writer: { computerId: 'cmp_one', kind: 'computer', serverId: 'srv_one' },
    });
    expect(consumed).toBe(false);
    expect(sent).toEqual([]);
});
