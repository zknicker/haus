import { expect, test } from 'bun:test';
import type { HausDatabase } from '../postgres/connection.ts';
import { ingestExecutionJournalUpload } from './ingest-execution-journal.ts';

test('a records frame with a malformed envelope is refused, so the Computer moves on', async () => {
    const sent: Array<{ computerId: string; frame: unknown }> = [];
    const consumed = await ingestExecutionJournalUpload(
        // The envelope is refused before any database work.
        {} as HausDatabase,
        {
            send: (computerId, frame) => {
                sent.push({ computerId, frame });
                return true;
            },
        },
        {
            computerId: 'cmp_one',
            frame: {
                agentId: 'agt_one',
                outline: { runId: 'run_one' },
                records: [{ record: { type: 'open' }, sequence: 7 }],
                runId: 'run_one',
                runStartedAt: '2026-10-14T12:00:00.000Z',
                type: 'agent-execution-journal-records',
            },
            serverId: 'srv_one',
        }
    );
    expect(consumed).toBe(true);
    expect(sent).toEqual([
        {
            computerId: 'cmp_one',
            frame: {
                agentId: 'agt_one',
                runId: 'run_one',
                status: 'refused',
                throughSequence: 7,
                type: 'agent-execution-journal-ack',
            },
        },
    ]);
});

test('a frame that is not a journal upload is left for other handlers', async () => {
    const sent: unknown[] = [];
    const consumed = await ingestExecutionJournalUpload(
        {} as HausDatabase,
        {
            send: (_computerId, frame) => {
                sent.push(frame);
                return true;
            },
        },
        { computerId: 'cmp_one', frame: { type: 'agent-activity' }, serverId: 'srv_one' }
    );
    expect(consumed).toBe(false);
    expect(sent).toEqual([]);
});
