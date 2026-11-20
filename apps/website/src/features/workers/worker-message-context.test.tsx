import { expect, test } from 'bun:test';
import { workerFixture } from './worker-fixture.ts';
import { WorkerMessageContext } from './worker-message-context.tsx';
import { WorkerReportNotice } from './worker-report-notice.tsx';
import { WorkerSummariesProvider } from './worker-summaries.tsx';
import { renderWorkerSurface } from './worker.test-utils.tsx';

const work = workerFixture({
    id: 'wkr_one',
    terminalAt: '2026-09-04T12:17:00.000Z',
    title: 'Fix the composer',
});

test('a follow-up names its Worker at once from the Task, before any Worker read', () => {
    const html = renderWorkerSurface(
        <WorkerSummariesProvider workers={[work]}>
            <WorkerMessageContext
                body={{ kind: 'worker-follow-up', workerId: 'wkr_one' }}
                serverId="srv_one"
            />
        </WorkerSummariesProvider>
    );

    expect(html).toContain('To Worker on Cursor');
    expect(html).toContain('Fix the composer');
});

test('a report is a one-line notice that names its Worker and outcome, never the report body', () => {
    const html = renderWorkerSurface(
        <WorkerSummariesProvider workers={[work]}>
            <WorkerReportNotice
                outcome="needs-you"
                serverId="srv_one"
                turnId="car_one"
                workerId="wkr_one"
            />
        </WorkerSummariesProvider>
    );

    expect(html).toContain('Fix the composer');
    expect(html).toContain('needs you, worked for 17m');
});
