import { afterEach, expect, test } from 'bun:test';
import {
    getChatSidePane,
    resetChatSidePanesForTest,
    setChatSidePane,
} from './use-chat-side-pane.ts';

afterEach(() => {
    resetChatSidePanesForTest();
});

test('the most recently opened chat side pane wins', () => {
    expect(getChatSidePane('chat-1')).toBe('artifact');

    setChatSidePane('chat-1', 'files');
    expect(getChatSidePane('chat-1')).toBe('files');
});

test('each chat keeps its own side pane', () => {
    setChatSidePane('chat-1', 'files');
    setChatSidePane('chat-2', 'files');

    setChatSidePane('chat-1', 'artifact');

    expect(getChatSidePane('chat-1')).toBe('artifact');
    expect(getChatSidePane('chat-2')).toBe('files');
});
