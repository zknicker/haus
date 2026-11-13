import { expect, test } from 'bun:test';
import {
    type BoardSetColumnsInput,
    boardCreateInputSchema,
    boardKeySchema,
    boardSchema,
    boardSetColumnsInputSchema,
    boardUpdateInputSchema,
    columnCategories,
    defaultBoardColumns,
    isClosedColumnCategory,
    requiredColumnCategories,
} from './board.ts';

const board = {
    archivedAt: null,
    columns: defaultBoardColumns.map((column, position) => ({
        ...column,
        id: `col_${position}`,
        position,
    })),
    createdAt: '2026-11-04T12:00:00.000Z',
    id: 'brd_sec',
    key: 'SEC',
    name: 'Security',
    openTaskCount: 3,
    serverId: 'srv_1',
    updatedAt: '2026-11-04T12:00:00.000Z',
    version: 1,
};

test('board keys are 2–5 uppercase characters starting with a letter', () => {
    for (const key of ['GEN', 'SEC', 'A1', 'OPS42']) {
        expect(boardKeySchema.safeParse(key).success).toBe(true);
    }
    for (const key of ['', 'S', 'sec', 'Sec', '1SEC', 'SECURE', 'SE-C', 'SEC-12', 'SÉC']) {
        expect(boardKeySchema.safeParse(key).success).toBe(false);
    }
    expect(boardCreateInputSchema.safeParse({ key: 'sec', name: 'S', serverId: 's' }).success).toBe(
        false
    );
});

test('columns map to the fixed category set', () => {
    expect(columnCategories).toEqual(['backlog', 'todo', 'active', 'done', 'canceled']);
    expect(boardSchema.parse(board)).toEqual(board);
    const [first, ...rest] = board.columns;
    expect(
        boardSchema.safeParse({ ...board, columns: [{ ...first, category: 'blocked' }, ...rest] })
            .success
    ).toBe(false);
    expect(
        boardSchema.safeParse({ ...board, columns: [{ ...first, name: 'x'.repeat(41) }, ...rest] })
            .success
    ).toBe(false);
    expect(boardSchema.safeParse({ ...board, name: '' }).success).toBe(false);
    expect(boardSchema.safeParse({ ...board, name: 'x'.repeat(61) }).success).toBe(false);
});

test('new boards start with every required category and closed columns complete a Task', () => {
    const categories = defaultBoardColumns.map((column) => column.category);
    for (const required of requiredColumnCategories) {
        expect(categories).toContain(required);
    }
    expect(defaultBoardColumns.map((column) => column.name)).toEqual([
        'Backlog',
        'Todo',
        'In progress',
        'Done',
        'Canceled',
    ]);
    expect(columnCategories.filter(isClosedColumnCategory)).toEqual(['done', 'canceled']);
});

test('board updates name at least one field and stay version-guarded', () => {
    const update = { boardId: 'brd_sec', expectedVersion: 2, serverId: 'srv_1' };
    expect(boardUpdateInputSchema.safeParse({ ...update, patch: { key: 'SECU' } }).success).toBe(
        true
    );
    expect(boardUpdateInputSchema.safeParse({ ...update, patch: {} }).success).toBe(false);
    expect(boardUpdateInputSchema.safeParse({ ...update, patch: { key: 'secu' } }).success).toBe(
        false
    );
    expect(
        boardUpdateInputSchema.safeParse({ ...update, expectedVersion: 0, patch: { name: 'X' } })
            .success
    ).toBe(false);
});

test('setColumns replaces the whole ordered list with optional ids and a move map', () => {
    const input: BoardSetColumnsInput = {
        boardId: 'brd_sec',
        columns: [
            { category: 'todo', id: 'col_1', name: 'Todo' },
            { category: 'active', name: 'Doing' },
            { category: 'done', id: 'col_3', name: 'Done' },
        ],
        expectedVersion: 4,
        moveTasks: { col_0: 'col_1' },
        serverId: 'srv_1',
    };
    expect(boardSetColumnsInputSchema.parse(input)).toEqual(input);
    expect(
        boardSetColumnsInputSchema.safeParse({
            ...input,
            columns: [{ category: 'review', name: 'Review' }],
        }).success
    ).toBe(false);
    expect(
        boardSetColumnsInputSchema.safeParse({
            ...input,
            columns: [{ category: 'todo', name: 'Todo', position: 0 }],
        }).success
    ).toBe(false);
});
