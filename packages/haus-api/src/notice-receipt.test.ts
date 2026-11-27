import { expect, test } from 'bun:test';
import { noticeReceipt } from './agent-delivery-frames.ts';

test('a notice receipt covers its inbox items, Issue items and crew reports', () => {
    expect(
        noticeReceipt({
            crewReports: { ids: ['crew-report:trp_1', 'crew-report:trp_2'] },
            inbox: [{ id: 'aib_maya' }],
            issueItems: { ids: ['issue-assign:iss_1:2'] },
            runId: 'run_busy',
        })
    ).toEqual({
        runId: 'run_busy',
        workIds: ['aib_maya', 'issue-assign:iss_1:2', 'crew-report:trp_1', 'crew-report:trp_2'],
    });
});

test('a notice with only crew reports still acks them', () => {
    expect(
        noticeReceipt({
            crewReports: { ids: ['crew-report:trp_1'] },
            inbox: [],
            runId: 'run_busy',
        })
    ).toEqual({ runId: 'run_busy', workIds: ['crew-report:trp_1'] });
});
