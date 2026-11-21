import { expect, test } from 'bun:test';
import { noticeReceipt } from './agent-delivery-frames.ts';

test('a notice receipt covers its inbox items, Task assignments and Worker reports', () => {
    expect(
        noticeReceipt({
            inbox: [{ id: 'aib_maya' }],
            runId: 'run_busy',
            taskAssignments: { ids: ['task-assignment:cl_1'] },
            workerReports: { ids: ['worker-report:wt_1', 'worker-report:wt_2'] },
        })
    ).toEqual({
        runId: 'run_busy',
        workIds: ['aib_maya', 'task-assignment:cl_1', 'worker-report:wt_1', 'worker-report:wt_2'],
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
