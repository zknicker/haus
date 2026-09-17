import { expect, test } from 'bun:test';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
    createComputerExecutionJournal,
    readComputerExecutionJournal,
} from './execution-journal.ts';
import { observeReasoningPart } from './reasoning-capture.ts';

test('a live journal exposes reasoning before a tool call or reasoning-end', async () => {
    const root = await mkdtemp(join(tmpdir(), 'haus-live-reasoning-'));
    try {
        const journal = await createComputerExecutionJournal({
            agentRoot: root,
            runId: 'run_live',
        });
        await observeReasoningPart({ type: 'reasoning-start', id: 'thinking' }, journal);
        await observeReasoningPart(
            { type: 'reasoning-delta', id: 'thinking', text: 'Checking the queue.' },
            journal
        );
        const live = await readComputerExecutionJournal(root, 'run_live');
        expect(live?.status).toBe('running');
        expect(live?.tools).toEqual([]);
        expect(live?.reasoning?.[0]).toMatchObject({ id: 'thinking', text: 'Checking the queue.' });
        await observeReasoningPart(
            { type: 'reasoning-delta', id: 'thinking', text: ' Ready.' },
            journal
        );
        await observeReasoningPart({ type: 'reasoning-end', id: 'thinking' }, journal);
        expect((await readComputerExecutionJournal(root, 'run_live'))?.reasoning?.[0]?.text).toBe(
            'Checking the queue. Ready.'
        );
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
