import { expect, test } from 'bun:test';
import { channelFootprint, expectShortFootprint } from './task-intake.mjs';
import { startedTaskKey } from './task-pacing.mjs';

const task = { id: 'tsk_1', key: 'GEN-14' };
const post = (id, content, taskLinks = []) => ({ content, id, taskLinks });
const acknowledgment = post('msg_ack', 'On it. Send the unpack command when the export lands.');
const reference = post('msg_ref', 'Tracking this in GEN-14.', [{ taskId: 'tsk_1' }]);

test('an acknowledgment plus one Task reference is a short footprint', () => {
    expect(() =>
        expectShortFootprint(
            expect,
            channelFootprint([acknowledgment, reference], task, { answer: '28' }),
            { references: [1, 1] }
        )
    ).not.toThrow();
});

test('a channel post carrying the result fails the footprint', () => {
    const copy = post('msg_copy', 'Final number is 28, details in GEN-14.');
    expect(() =>
        expectShortFootprint(
            expect,
            channelFootprint([acknowledgment, copy], task, { answer: '28' })
        )
    ).toThrow(/repeating the result/u);
});

test('a second acknowledgment beside the reference fails the footprint', () => {
    const again = post('msg_again', 'Still waiting on the export.');
    expect(() =>
        expectShortFootprint(expect, channelFootprint([acknowledgment, again, reference], task))
    ).toThrow(/besides the Task reference/u);
});

test('a multi-line channel post fails the footprint', () => {
    const long = post('msg_long', 'Findings so far:\n- the ledger is short');
    expect(() => expectShortFootprint(expect, channelFootprint([long], task))).toThrow(
        /one brief line/u
    );
});

test('a started Task is read by the key the Agent API returns', () => {
    expect(
        startedTaskKey({ ok: true, status: 200 }, { target: 'task:GEN-9', task: { key: 'GEN-9' } })
    ).toBe('GEN-9');
    expect(() => startedTaskKey({ ok: false, status: 400 }, { code: 'INVALID_ARG' })).toThrow(
        /Agent Task start failed \(400\)/u
    );
});
