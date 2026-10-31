import { describe, expect, test } from 'bun:test';
import type { Chat, ChatMessage, UnreadThread } from '@haus/api';
import {
    earlierUnread,
    initialUnreadSelection,
    resolveOpenRow,
    selectionAfterLeaving,
    stepSelection,
    unreadRowReadInput,
} from './unread-row-model.ts';
import type { UnreadRow } from './unread-rows.ts';

const serverId = 'srv_1';

const chatRow = {
    chat: { id: 'cht_a', lastMessageSequence: 12 } as Chat,
    id: 'cht_a',
    kind: 'chat',
} satisfies UnreadRow;

const threadRow = {
    id: 'cht_thread',
    kind: 'thread',
    parent: { id: 'cht_a', lastMessageSequence: 12 } as Chat,
    thread: {
        lastMessageSequence: 4,
        parentChatId: 'cht_a',
        threadChatId: 'cht_thread',
    } as UnreadThread,
} satisfies UnreadRow;

function rowsOf(...ids: string[]): UnreadRow[] {
    return ids.map((id) => ({ chat: { id } as Chat, id, kind: 'chat' }));
}

describe('unreadRowReadInput', () => {
    test('Mark read on a Chat reads it and every Thread under it', () => {
        expect(unreadRowReadInput(chatRow, serverId, 'mark-read')).toEqual({
            chatId: 'cht_a',
            includeThreads: true,
            sequence: 12,
            serverId,
        });
    });

    test('a reply in a Chat reads only the Chat, leaving its Thread rows unread', () => {
        expect(unreadRowReadInput(chatRow, serverId, 'reply')).toEqual({
            chatId: 'cht_a',
            sequence: 12,
            serverId,
        });
    });

    test('a Thread row reads the Thread’s own Chat either way, never its parent', () => {
        const expected = { chatId: 'cht_thread', sequence: 4, serverId };
        expect(unreadRowReadInput(threadRow, serverId, 'mark-read')).toEqual(expected);
        expect(unreadRowReadInput(threadRow, serverId, 'reply')).toEqual(expected);
    });
});

describe('the open row', () => {
    test('the first row is open until the viewer picks another', () => {
        expect(resolveOpenRow(rowsOf('a', 'b'), initialUnreadSelection)?.row.id).toBe('a');
        expect(resolveOpenRow([], initialUnreadSelection)).toBeNull();
    });

    test('the open row stays open while newer activity reorders the list', () => {
        const selection = { carryFocus: false, id: 'b', index: 1 };
        expect(resolveOpenRow(rowsOf('c', 'a', 'b'), selection)).toMatchObject({
            index: 2,
            row: { id: 'b' },
        });
    });

    test('a row read elsewhere hands its place to the row that slid into it', () => {
        const selection = { carryFocus: false, id: 'b', index: 1 };
        expect(resolveOpenRow(rowsOf('a', 'c'), selection)?.row.id).toBe('c');
        expect(resolveOpenRow(rowsOf('a'), selection)?.row.id).toBe('a');
    });

    test('J and K step one row and stop at either end', () => {
        const rows = rowsOf('a', 'b', 'c');
        const atB = { carryFocus: false, id: 'b', index: 1 };
        expect(stepSelection(rows, atB, 1, false).id).toBe('c');
        expect(stepSelection(rows, atB, -1, true)).toEqual({ carryFocus: true, id: 'a', index: 0 });
        expect(stepSelection(rows, initialUnreadSelection, -1, false).id).toBe('a');
        expect(stepSelection(rows, { ...atB, id: 'c', index: 2 }, 1, false).id).toBe('c');
    });

    test('reading the open row opens the next, or the one above when it was last', () => {
        const rows = rowsOf('a', 'b', 'c');
        expect(selectionAfterLeaving(rows, 'b', true)).toEqual({
            carryFocus: true,
            id: 'c',
            index: 1,
        });
        expect(selectionAfterLeaving(rows, 'c', false)).toEqual({
            carryFocus: false,
            id: 'b',
            index: 1,
        });
        expect(selectionAfterLeaving(rowsOf('a'), 'a', false).id).toBeNull();
    });
});

describe('earlierUnread', () => {
    const messages = [{}, {}, {}] as ChatMessage[];

    test('first reveals the waiting messages the row holds, counting everything earlier', () => {
        expect(earlierUnread({ earlierUnreadCount: 4, messages }, false)).toEqual({
            action: 'reveal',
            label: '6 earlier',
        });
    });

    test('then opens the conversation for the counted messages older still', () => {
        expect(earlierUnread({ earlierUnreadCount: 4, messages }, true)).toEqual({
            action: 'open',
            label: '4 earlier',
        });
        expect(
            earlierUnread({ earlierUnreadCount: 2, messages: [{} as ChatMessage] }, false)
        ).toEqual({ action: 'open', label: '2 earlier' });
    });

    test('says nothing when the row shows every waiting message', () => {
        expect(earlierUnread({ earlierUnreadCount: 0, messages }, true)).toBeNull();
        expect(
            earlierUnread({ earlierUnreadCount: 0, messages: [{} as ChatMessage] }, false)
        ).toBeNull();
    });
});
