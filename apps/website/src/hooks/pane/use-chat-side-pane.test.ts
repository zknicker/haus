import { afterEach, expect, test } from 'bun:test';
import {
    closeThreadPane,
    openThreadPane,
    resetThreadPanesForTest,
} from '../threads/use-thread-pane.ts';
import {
    getChatSidePane,
    resetChatSidePanesForTest,
    setChatSidePane,
} from './use-chat-side-pane.ts';

afterEach(() => {
    resetThreadPanesForTest();
    resetChatSidePanesForTest();
});

test('the most recently opened chat side pane wins', () => {
    setChatSidePane('chat-1', 'artifact');
    openThreadPane('chat-1', { anchorMessageId: 'msg_1', threadChatId: null });
    expect(getChatSidePane('chat-1')).toBe('thread');

    setChatSidePane('chat-1', 'artifact');
    expect(getChatSidePane('chat-1')).toBe('artifact');

    openThreadPane('chat-1', { anchorMessageId: 'msg_2', threadChatId: null });
    expect(getChatSidePane('chat-1')).toBe('thread');
});

test('closing a thread restores the artifact pane for that chat only', () => {
    openThreadPane('chat-1', { anchorMessageId: 'msg_1', threadChatId: 'cht_thr_1' });
    openThreadPane('chat-2', { anchorMessageId: 'msg_2', threadChatId: 'cht_thr_2' });

    closeThreadPane('chat-1');

    expect(getChatSidePane('chat-1')).toBe('artifact');
    expect(getChatSidePane('chat-2')).toBe('thread');
});
