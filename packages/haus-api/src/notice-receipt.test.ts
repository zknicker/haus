import { expect, test } from 'bun:test';
import { noticeReceipt } from './agent-delivery-frames.ts';

test('a notice receipt covers its inbox items, Issue items and crew finishes', () => {
    expect(
        noticeReceipt({
            crewFinishes: { ids: ['crew-finish:tsk_1:run_1', 'crew-finish:tsk_1:run_2'] },
            inbox: [{ id: 'aib_maya' }],
            issueItems: { ids: ['issue-assign:iss_1:2'] },
            runId: 'run_busy',
        })
    ).toEqual({
        runId: 'run_busy',
        workIds: ['aib_maya', 'issue-assign:iss_1:2', 'crew-finish:tsk_1:run_1', 'crew-finish:tsk_1:run_2'],
    });
});

test('a notice with only crew finishes still acks them', () => {
    expect(
        noticeReceipt({
            crewFinishes: { ids: ['crew-finish:tsk_1:run_1'] },
            inbox: [],
            runId: 'run_busy',
        })
    ).toEqual({ runId: 'run_busy', workIds: ['crew-finish:tsk_1:run_1'] });
});
