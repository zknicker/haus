import { expect, test } from 'bun:test';
import { TASK_REPLAY_MAX_CHARS, type TaskReplayMessage } from '@haus/api';
import { composeTaskReplay } from './task-replay-format.ts';

test('a fresh Task session rereads its chat oldest first, newest kept within the budget', () => {
    const big = 'x'.repeat(TASK_REPLAY_MAX_CHARS - 10);
    const replay = composeTaskReplay({
        brief: message(1, 'orbit', 'Draft the release notes.'),
        messages: [
            message(7, 'zach', 'Dropped for size.'),
            message(8, 'orbit', big),
            message(9, 'zach', 'Ship it.'),
        ],
    });
    expect(replay?.split('\n').map((line) => line.slice(0, 60))).toEqual([
        '[Haus task history] This session is new, so you start from y',
        '[msg=msg_1 time=2026-11-26T10:01:00.000Z brief] @orbit: Draf',
        '(earlier messages left out)',
        `[msg=msg_8 time=2026-11-26T10:08:00.000Z] @orbit: ${'x'.repeat(10)}`,
        '[msg=msg_9 time=2026-11-26T10:09:00.000Z] @zach: Ship it.',
    ]);
});

test('the brief stays when the messages after it fill the budget, and no gap shows when none was cut', () => {
    const huge = 'y'.repeat(TASK_REPLAY_MAX_CHARS);
    const cut = composeTaskReplay({
        brief: message(1, 'orbit', 'Draft the release notes.'),
        messages: [message(2, 'zach', huge), message(3, 'zach', huge)],
    });
    expect(cut?.split('\n').map((line) => line.slice(0, 50))).toEqual([
        '[Haus task history] This session is new, so you st',
        '[msg=msg_1 time=2026-11-26T10:01:00.000Z brief] @o',
        '(earlier messages left out)',
        '[msg=msg_3 time=2026-11-26T10:03:00.000Z] @zach: y',
    ]);
    const whole = composeTaskReplay({
        brief: message(1, 'orbit', 'Draft the release notes.'),
        messages: [message(2, 'zach', 'Ship it.')],
    });
    expect(whole).not.toContain('left out');
});

test('a Task with nothing before the messages that woke it rereads nothing', () => {
    expect(composeTaskReplay({ brief: null, messages: [] })).toBeNull();
});

function message(sequence: number, author: string, body: string) {
    const row: TaskReplayMessage = {
        author,
        body,
        createdAt: `2026-11-26T10:0${sequence}:00.000Z`,
        id: `msg_${sequence}`,
        sequence,
    };
    return row;
}
