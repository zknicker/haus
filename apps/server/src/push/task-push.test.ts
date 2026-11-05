import { expect, test } from 'bun:test';
import type { TaskAssignedEvent } from '@haus/api';
import { createPushQueue } from './push-queue.ts';
import { createTaskPushWindow } from './task-push.ts';

function assigned(taskId: string, userId = 'usr_bo'): TaskAssignedEvent {
    return {
        assignedBy: { agentId: 'agt_zero', kind: 'agent' },
        serverId: 'srv_one',
        taskId,
        userId,
        version: 1,
    };
}

function windowed(readGraceMs: number, maxBacklog = 10) {
    const queue = createPushQueue({ concurrency: 1, maxBacklog });
    const sends: string[][] = [];
    const window = createTaskPushWindow(queue, readGraceMs, async (events) => {
        sends.push(events.map((event) => event.taskId));
    });
    return { queue, sends, window };
}

test("assignments inside one person's grace are one send, in order", async () => {
    const { queue, sends, window } = windowed(30);

    window.add(assigned('tsk_1'));
    window.add(assigned('tsk_2'));
    window.add(assigned('tsk_3'));
    await queue.drain();

    expect(sends).toEqual([['tsk_1', 'tsk_2', 'tsk_3']]);
});

test('each person has their own window', async () => {
    const { queue, sends, window } = windowed(30);

    window.add(assigned('tsk_1', 'usr_bo'));
    window.add(assigned('tsk_2', 'usr_cass'));
    await queue.drain();

    expect(sends).toHaveLength(2);
    expect(sends).toEqual(expect.arrayContaining([['tsk_1'], ['tsk_2']]));
});

test('an assignment after the grace opens a new window', async () => {
    const { queue, sends, window } = windowed(30);

    window.add(assigned('tsk_1'));
    await queue.drain();
    window.add(assigned('tsk_2'));
    await queue.drain();

    expect(sends).toEqual([['tsk_1'], ['tsk_2']]);
});

test('a full backlog drops the window instead of holding it open', async () => {
    const { queue, sends, window } = windowed(30, 0);

    window.add(assigned('tsk_1'));
    await queue.drain();

    expect(sends).toEqual([]);
});
