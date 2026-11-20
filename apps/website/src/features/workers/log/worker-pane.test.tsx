import { expect, test } from 'bun:test';
import { workerTurnFixture as turn, workerFixture as work } from '../worker-fixture.ts';
import { askReport, renderWorkerSurface } from '../worker.test-utils.tsx';
import { WorkerPane } from './worker-pane.tsx';

test('the pane names the Worker, offers Back to Overview and Close, and holds its session log', () => {
    const worker = work({
        title: 'Fix iPad composer baseline',
        turns: [turn({ outcome: { kind: 'report', report: askReport }, status: 'pending_input' })],
    });
    const html = renderWorkerSurface(
        <WorkerPane onClose={() => undefined} workerId={worker.id} />,
        { task: { chatId: 'cht_task', id: 'tsk_one', key: 'GEN-1' }, worker }
    );

    expect(html).toContain('aria-label="Back to Overview"');
    expect(html).toContain('aria-label="Close Worker"');
    expect(html).toContain('Fix iPad composer baseline');
    expect(html).toContain('data-testid="worker-session"');
});
