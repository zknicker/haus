import { expect, mock, test } from 'bun:test';
import { routeChatFilesOpen } from './use-chat-files-pane.ts';

test('desktop opens a chat Files tab instead of the chat side panel', () => {
    const openFilesTab = mock((_chatId: string) => undefined);
    const openPanel = mock(() => undefined);

    routeChatFilesOpen('chat-1', { openFilesTab, openPanel });

    expect(openFilesTab).toHaveBeenCalledWith('chat-1');
    expect(openPanel).not.toHaveBeenCalled();
});

test('the website opens Files in the chat side panel', () => {
    const openPanel = mock(() => undefined);

    routeChatFilesOpen('chat-1', { openFilesTab: undefined, openPanel });

    expect(openPanel).toHaveBeenCalledTimes(1);
});
