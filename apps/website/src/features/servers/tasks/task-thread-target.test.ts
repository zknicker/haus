import { expect, test } from 'bun:test';
import { isThreadTask, taskChatRoute, taskThreadTarget } from './task-thread-target.ts';

test('a top-level task opens the Thread anchored on its own message', () => {
    const source = {
        message: { chatId: 'cht_dm', id: 'msg_task' },
        task: { chatId: 'cht_dm', threadChatId: 'cht_thr_task' },
        threadSummary: { anchorMessageId: 'msg_task' },
    };

    expect(isThreadTask(source)).toBe(false);
    expect(taskThreadTarget(source)).toEqual({
        anchorMessageId: 'msg_task',
        kind: 'anchor',
        threadChatId: 'cht_thr_task',
    });
});

test('a Thread task opens the Thread it sits in, anchored on that Thread’s anchor', () => {
    const source = {
        message: { chatId: 'cht_thr_anchor', id: 'msg_reply' },
        task: { chatId: 'cht_dm', threadChatId: 'cht_thr_anchor' },
        threadSummary: { anchorMessageId: 'msg_anchor' },
    };

    expect(isThreadTask(source)).toBe(true);
    expect(taskThreadTarget(source)).toEqual({
        anchorMessageId: 'msg_anchor',
        kind: 'in-thread',
        taskMessageId: 'msg_reply',
        threadChatId: 'cht_thr_anchor',
    });
});

test('"View in chat" opens a Thread task’s parent chat on the Thread it sits in', () => {
    expect(
        taskChatRoute('acme', {
            chatId: 'cht_dm',
            message: { chatId: 'cht_thr_anchor', id: 'msg_reply' },
            threadChatId: 'cht_thr_anchor',
            threadSummary: { anchorMessageId: 'msg_anchor' },
        })
    ).toBe('/s/acme/chats/cht_dm?thread=msg_anchor');
    expect(
        taskChatRoute('acme', {
            chatId: 'cht_dm',
            message: { chatId: 'cht_dm', id: 'msg_task' },
            threadChatId: 'cht_thr_task',
            threadSummary: { anchorMessageId: 'msg_task' },
        })
    ).toBe('/s/acme/chats/cht_dm');
});

test('a Thread task never anchors a Thread on its own message', () => {
    // A summary keyed on the task message itself names no containing Thread;
    // opening it as an anchor would reply to an in-Thread message and nest.
    expect(
        taskThreadTarget({
            message: { chatId: 'cht_thr_anchor', id: 'msg_reply' },
            task: { chatId: 'cht_dm', threadChatId: 'cht_thr_anchor' },
            threadSummary: { anchorMessageId: 'msg_reply' },
        })
    ).toBeNull();
});
