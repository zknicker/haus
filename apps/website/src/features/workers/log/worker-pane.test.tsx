import { expect, test } from 'bun:test';
import { workerTurnFixture as turn, workerFixture as work } from '../worker-fixture.ts';
import { askReport, renderWorkerSurface } from '../worker.test-utils.tsx';
import { WorkerPane } from './worker-pane.tsx';

test('a Worker tab holds its conversation and composer', () => {
    const worker = work({
        title: 'Fix iPad composer baseline',
        turns: [turn({ outcome: { kind: 'report', report: askReport }, status: 'pending_input' })],
    });
    const html = renderWorkerSurface(<WorkerPane workerId={worker.id} />, {
        task: { chatId: 'cht_task', id: 'tsk_one', key: 'GEN-1' },
        worker,
    });

    expect(html).toContain('data-testid="worker-session"');
    expect(html).toContain('Fixed five of six.');
    expect(html).toContain('prompt-input');
});
