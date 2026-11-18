import { describe, expect, test } from 'bun:test';
import type { Chat, ChatMessage } from '@haus/api';
import {
    earlierUnread,
    initialUnreadSelection,
    resolveSelectedRow,
    selectionAfterLeaving,
    stepSelection,
    unreadRowReadInput,
} from './unread-row-model.ts';
import type { FollowedTaskPreview, UnreadRow } from './unread-rows.ts';

const serverId = 'srv_1';

const chatRow = {
    chat: { id: 'cht_a', lastMessageSequence: 12 } as Chat,
    id: 'cht_a',
    kind: 'chat',
} satisfies UnreadRow;

const taskRow = {
    id: 'cht_task',
    kind: 'task-chat',
    preview: {
        chatId: 'cht_task',
        messages: [{ sequence: 3 }, { sequence: 4 }],
    } as unknown as FollowedTaskPreview,
} satisfies UnreadRow;

function rowsOf(...ids: string[]): UnreadRow[] {
    return ids.map((id) => ({ chat: { id } as Chat, id, kind: 'chat' }));
}

describe('unreadRowReadInput', () => {
    test('a Chat row reads its Chat through its newest message', () => {
        expect(unreadRowReadInput(chatRow, serverId)).toEqual({
            chatId: 'cht_a',
            sequence: 12,
            serverId,
        });
    });

    test('a Task row reads the Task’s Chat through the newest message it shows', () => {
        expect(unreadRowReadInput(taskRow, serverId)).toEqual({
            chatId: 'cht_task',
            sequence: 4,
            serverId,
        });
    });
});

describe('the selected card', () => {
    test('the first card is selected until the viewer picks another', () => {
        expect(resolveSelectedRow(rowsOf('a', 'b'), initialUnreadSelection)?.row.id).toBe('a');
        expect(resolveSelectedRow([], initialUnreadSelection)).toBeNull();
    });

    test('the selected card stays selected while newer activity reorders the list', () => {
        const selection = { carryFocus: false, id: 'b', index: 1 };
        expect(resolveSelectedRow(rowsOf('c', 'a', 'b'), selection)).toMatchObject({
            index: 2,
            row: { id: 'b' },
        });
    });

    test('a card read elsewhere hands its place to the card that slid into it', () => {
        const selection = { carryFocus: false, id: 'b', index: 1 };
        expect(resolveSelectedRow(rowsOf('a', 'c'), selection)?.row.id).toBe('c');
        expect(resolveSelectedRow(rowsOf('a'), selection)?.row.id).toBe('a');
    });

    test('J and K step one card and stop at either end', () => {
        const rows = rowsOf('a', 'b', 'c');
        const atB = { carryFocus: false, id: 'b', index: 1 };
        expect(stepSelection(rows, atB, 1, false).id).toBe('c');
        expect(stepSelection(rows, atB, -1, true)).toEqual({ carryFocus: true, id: 'a', index: 0 });
        expect(stepSelection(rows, initialUnreadSelection, -1, false).id).toBe('a');
        expect(stepSelection(rows, { ...atB, id: 'c', index: 2 }, 1, false).id).toBe('c');
    });

    test('reading the selected card selects the next, or the one above when it was last', () => {
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
