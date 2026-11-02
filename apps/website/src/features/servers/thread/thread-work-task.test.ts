import { expect, test } from 'bun:test';
import type { MessageTask } from '@haus/api';
import { threadWorkTask } from './thread-work-task.ts';

const anchorTask = { number: 1 } as MessageTask;
const replyTask = { number: 2 } as MessageTask;

test('a Thread opened on its anchor’s task states that task', () => {
    expect(threadWorkTask({ id: 'msg_anchor', task: anchorTask }, null)).toEqual({
        messageId: 'msg_anchor',
        task: anchorTask,
    });
});

test('a Thread opened on a reply’s task states the reply’s task, not the anchor’s', () => {
    expect(
        threadWorkTask({ id: 'msg_anchor', task: anchorTask }, { id: 'msg_reply', task: replyTask })
    ).toEqual({ messageId: 'msg_reply', task: replyTask });
});

test('a plain Thread states no task', () => {
    expect(threadWorkTask({ id: 'msg_anchor', task: null }, undefined)).toBeNull();
});
