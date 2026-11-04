import { describe, expect, test } from 'bun:test';
import type { Board } from '@haus/api';
import { findBoardColumn, putBoard } from './board-cache.ts';

describe('putBoard', () => {
    test('adds a new board at the end, in creation order', () => {
        const added = board('brd_sec', { key: 'SEC' });
        expect(putBoard([board('brd_gen')], added)?.map((item) => item.id)).toEqual([
            'brd_gen',
            'brd_sec',
        ]);
    });

    test('replaces a board in place, and keeps a newer read that already landed', () => {
        const boards = [board('brd_gen', { version: 3 }), board('brd_sec')];
        expect(putBoard(boards, board('brd_gen', { name: 'Old', version: 2 }))).toBe(boards);
        expect(putBoard(boards, board('brd_gen', { name: 'New', version: 4 }))?.[0]?.name).toBe(
            'New'
        );
    });

    test('an archived board leaves the default list', () => {
        const archived = board('brd_sec', { archivedAt: '2026-11-04T12:00:00.000Z', version: 2 });
        expect(
            putBoard([board('brd_gen'), board('brd_sec')], archived)?.map((item) => item.id)
        ).toEqual(['brd_gen']);
    });

    test('leaves an unread list unread', () => {
        expect(putBoard(undefined, board('brd_gen'))).toBeUndefined();
    });
});

test('findBoardColumn finds a column across boards', () => {
    const column = { category: 'todo', id: 'col_todo', name: 'Todo', position: 0 } as const;
    expect(
        findBoardColumn([board('brd_gen'), board('brd_sec', { columns: [column] })], 'col_todo')
    ).toEqual(column);
    expect(findBoardColumn(undefined, 'col_todo')).toBeUndefined();
});

function board(id: string, overrides: Partial<Board> = {}): Board {
    return {
        archivedAt: null,
        columns: [],
        createdAt: '2026-11-04T12:00:00.000Z',
        id,
        key: 'GEN',
        name: 'General',
        openTaskCount: 0,
        serverId: 'srv_1',
        updatedAt: '2026-11-04T12:00:00.000Z',
        version: 1,
        ...overrides,
    };
}
