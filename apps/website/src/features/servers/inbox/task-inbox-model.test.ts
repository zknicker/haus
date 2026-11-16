import { describe, expect, test } from 'bun:test';
import type { BoardColumn, Chat, ChatMessage, TaskMessagePlace } from '@haus/api';
import {
    type ResolvedTask,
    taskReplyPlace,
    taskResolveActions,
    withResolvedRow,
} from './task-inbox-model.ts';
import { resolveSelectedRow, selectionAfterLeaving } from './unread-row-model.ts';
import type { UnreadRow } from './unread-rows.ts';

function column(id: string, category: BoardColumn['category']): BoardColumn {
    return { category, id, name: id, position: 0 };
}

const columns = [
    column('backlog', 'backlog'),
    column('todo', 'todo'),
    column('doing', 'active'),
    column('review', 'active'),
    column('shipped', 'done'),
    column('dropped', 'canceled'),
];

describe('taskResolveActions', () => {
    test('each action moves to the first column of its category', () => {
        expect(
            taskResolveActions({ columns }, { category: 'todo' }).map((action) => [
                action.label,
                action.column.id,
            ])
        ).toEqual([
            ['Start', 'doing'],
            ['Done', 'shipped'],
            ["Won't do", 'dropped'],
        ]);
    });

    test('a Task already in a category is not offered it', () => {
        const labels = taskResolveActions({ columns }, { category: 'active' }).map(
            (action) => action.label
        );
        expect(labels).toEqual(['Done', "Won't do"]);
    });

    test("a board without a canceled column has no Won't do", () => {
        const board = { columns: columns.filter((entry) => entry.category !== 'canceled') };
        const labels = taskResolveActions(board, { category: 'todo' }).map(
            (action) => action.label
        );
        expect(labels).toEqual(['Start', 'Done']);
    });
});

describe('where a card replies', () => {
    const channel = { id: 'cht_all', kind: 'channel', name: 'all' } as Chat;
    const chats = new Map([[channel.id, channel]]);
    const contextMessage = { chatId: 'cht_all', id: 'msg_context' } as ChatMessage;
    const place = (threadAnchorMessageId: null | string): TaskMessagePlace => ({
        chatId: 'cht_all',
        chatKind: 'channel',
        chatName: 'all',
        threadAnchorMessageId,
    });

    test('a top-level message anchors its own Thread', () => {
        expect(taskReplyPlace({ contextMessage, contextPlace: place(null) }, chats)).toEqual({
            anchorMessageId: 'msg_context',
            parent: channel,
        });
    });

    test('a Thread reply answers in the Thread it sits in', () => {
        expect(
            taskReplyPlace({ contextMessage, contextPlace: place('msg_anchor') }, chats)
        ).toEqual({ anchorMessageId: 'msg_anchor', parent: channel });
    });

    test('no message, or a Chat the reader does not hold, has no place to reply', () => {
        expect(taskReplyPlace({ contextMessage: null, contextPlace: null }, chats)).toBeNull();
        expect(taskReplyPlace({ contextMessage, contextPlace: place(null) }, new Map())).toBeNull();
    });
});

describe('the resolved row', () => {
    const chatRow = (id: string) => ({ chat: { id } as Chat, id, kind: 'chat' }) as UnreadRow;
    const rows = [chatRow('a'), chatRow('b')];
    const resolved = (index: number) =>
        ({ index, item: { task: { id: 'tsk_one' } } }) as ResolvedTask;

    test('holds the place its card left', () => {
        expect(withResolvedRow(rows, resolved(1)).map((row) => row.id)).toEqual([
            'a',
            'resolved:tsk_one',
            'b',
        ]);
    });

    test('falls to the end when the queue shrank past it', () => {
        expect(withResolvedRow(rows, resolved(9)).at(-1)?.id).toBe('resolved:tsk_one');
    });

    test('is nothing without a resolve', () => {
        expect(withResolvedRow(rows, null)).toBe(rows);
    });

    test('the queue works past a Task card like any other', () => {
        const task = { id: 'tsk_one', item: {}, kind: 'task' } as UnreadRow;
        const queue = [chatRow('a'), task, chatRow('b')];
        const selection = selectionAfterLeaving(queue, 'tsk_one', false);

        expect(selection).toEqual({ carryFocus: false, id: 'b', index: 1 });
        expect(resolveSelectedRow(rows, selection)?.row.id).toBe('b');
    });
});
