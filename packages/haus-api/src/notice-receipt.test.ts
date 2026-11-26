import { expect, test } from 'bun:test';
import { noticeReceipt } from './agent-delivery-frames.ts';

test('a notice receipt covers its inbox items, Issue items and Worker reports', () => {
    expect(
        noticeReceipt({
            inbox: [{ id: 'aib_maya' }],
            issueItems: { ids: ['issue-assign:iss_1:2'] },
            runId: 'run_busy',
            workerReports: { ids: ['worker-report:wt_1', 'worker-report:wt_2'] },
        })
    ).toEqual({
        runId: 'run_busy',
        workIds: ['aib_maya', 'issue-assign:iss_1:2', 'worker-report:wt_1', 'worker-report:wt_2'],
    });
});

test('a notice with only Worker reports still acks them', () => {
    expect(
        noticeReceipt({
            inbox: [],
            runId: 'run_busy',
            workerReports: { ids: ['worker-report:wt_1'] },
        })
    ).toEqual({ runId: 'run_busy', workIds: ['worker-report:wt_1'] });
});
