import { expect, test } from 'bun:test';
import type { Chat } from '@haus/api';
import { resolveChatPageChat } from './chat-page-state.ts';

test('uses the selected list snapshot while its detail query loads', () => {
    const listedChat = { id: 'chat-2', name: 'native-feel' } as Chat;

    expect(resolveChatPageChat({ detail: undefined, isPending: true, listed: listedChat })).toBe(
        listedChat
    );
});

test('prefers the focused detail snapshot once it arrives', () => {
    const listedChat = { id: 'chat-2', name: 'old-name' } as Chat;
    const detailChat = { id: 'chat-2', name: 'native-feel' } as Chat;

    expect(resolveChatPageChat({ detail: detailChat, isPending: false, listed: listedChat })).toBe(
        detailChat
    );
});

test('does not preserve a missing chat after the detail query settles', () => {
    const listedChat = { id: 'chat-2', name: 'deleted-chat' } as Chat;

    expect(
        resolveChatPageChat({ detail: undefined, isPending: false, listed: listedChat })
    ).toBeUndefined();
});
