import { describe, expect, test } from 'bun:test';
import { BoardInvariantError } from './board-errors.ts';
import { planBoardColumns, type StoredBoardColumn } from './column-plan.ts';

const existing: StoredBoardColumn[] = [
    { category: 'backlog', id: 'col_backlog', name: 'Backlog' },
    { category: 'todo', id: 'col_todo', name: 'Todo' },
    { category: 'active', id: 'col_active', name: 'In progress' },
    { category: 'done', id: 'col_done', name: 'Done' },
];

const required = [
    { category: 'todo' as const, id: 'col_todo', name: 'Todo' },
    { category: 'active' as const, id: 'col_active', name: 'In progress' },
    { category: 'done' as const, id: 'col_done', name: 'Done' },
];

function plan(
    drafts: Parameters<typeof planBoardColumns>[0]['drafts'],
    options: { moveTasks?: Record<string, string>; taskCounts?: Record<string, number> } = {}
) {
    return planBoardColumns({
        drafts,
        existing,
        moveTasks: options.moveTasks ?? {},
        taskCounts: new Map(Object.entries(options.taskCounts ?? {})),
    });
}

describe('planBoardColumns', () => {
    test('keeps, renames, reorders, creates, and removes in one list', () => {
        expect(
            plan([
                { category: 'active', id: 'col_active', name: 'Doing' },
                { category: 'todo', id: 'col_todo', name: 'Todo' },
                { category: 'active', name: 'Review' },
                { category: 'done', id: 'col_done', name: 'Done' },
            ])
        ).toEqual({
            created: [{ category: 'active', name: 'Review', position: 2 }],
            kept: [
                { category: 'active', id: 'col_active', name: 'Doing', position: 0 },
                { category: 'todo', id: 'col_todo', name: 'Todo', position: 1 },
                { category: 'done', id: 'col_done', name: 'Done', position: 3 },
            ],
            moves: [],
            removed: ['col_backlog'],
        });
    });

    test('requires todo, active, and done', () => {
        expect(() => plan(required.slice(0, 2))).toThrow(/missing done/);
    });

    test('refuses repeated names case-insensitively, unknown ids, and repeated ids', () => {
        expect(() => plan([...required, { category: 'done', name: 'DONE' }])).toThrow(
            BoardInvariantError
        );
        expect(() => plan([...required, { category: 'done', id: 'col_other', name: 'X' }])).toThrow(
            /not a column of this board/
        );
        expect(() => plan([...required, { category: 'todo', id: 'col_todo', name: 'Y' }])).toThrow(
            /appears twice/
        );
    });

    test('a removed column with Tasks needs a move to a column that stays', () => {
        expect(() => plan(required, { taskCounts: { col_backlog: 2 } })).toThrow(/moveTasks/);
        expect(() =>
            plan(required, {
                moveTasks: { col_backlog: 'col_backlog' },
                taskCounts: { col_backlog: 2 },
            })
        ).toThrow(/existing column that stays/);
        expect(() => plan(required, { moveTasks: { col_todo: 'col_done' } })).toThrow(
            /not removed/
        );
        expect(
            plan(required, {
                moveTasks: { col_backlog: 'col_todo' },
                taskCounts: { col_backlog: 2 },
            }).moves
        ).toEqual([{ from: 'col_backlog', to: 'col_todo' }]);
        expect(plan(required).moves).toEqual([]);
    });
});
