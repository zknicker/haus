import { describe, expect, test } from 'bun:test';
import type { Board } from '@haus/api';
import {
    type ColumnDraft,
    columnPlanInput,
    columnPlanProblem,
    columnsChanged,
    isLastOfRequiredCategory,
    reorderColumnDrafts,
    suggestBoardKey,
    toColumnDrafts,
} from './board-column-plan.ts';

const board: Board = {
    archivedAt: null,
    columns: [
        { category: 'active', id: 'col_active', name: 'In progress', position: 1 },
        { category: 'todo', id: 'col_todo', name: 'Todo', position: 0 },
        { category: 'done', id: 'col_done', name: 'Done', position: 2 },
    ],
    createdAt: '2026-11-01T00:00:00.000Z',
    id: 'brd_one',
    key: 'SEC',
    name: 'Security',
    openTaskCount: 0,
    serverId: 'srv_one',
    updatedAt: '2026-11-01T00:00:00.000Z',
    version: 3,
};
const drafts = toColumnDrafts(board.columns);
const review: ColumnDraft = { category: 'active', id: 'new', name: 'Review' };

describe('board column plan', () => {
    test('drafts follow position order and start unchanged', () => {
        expect(drafts.map((draft) => draft.name)).toEqual(['Todo', 'In progress', 'Done']);
        expect(columnsChanged(board, drafts)).toBe(false);
    });

    test('a rename, a new column, and a reorder each count as a change', () => {
        expect(
            columnsChanged(
                board,
                drafts.map((draft) => ({ ...draft, name: `${draft.name}!` }))
            )
        ).toBe(true);
        expect(columnsChanged(board, [...drafts, review])).toBe(true);
        expect(
            columnsChanged(board, reorderColumnDrafts(drafts, 'col_done', 'col_todo', 'before'))
        ).toBe(true);
    });

    test('the last column of a required category locks', () => {
        const active = drafts[1] as ColumnDraft;
        expect(isLastOfRequiredCategory(drafts, active)).toBe(true);
        expect(isLastOfRequiredCategory([...drafts, review], active)).toBe(false);
        expect(
            isLastOfRequiredCategory(drafts, { category: 'backlog', id: 'b', name: 'Later' })
        ).toBe(false);
    });

    test('the plan names what blocks a save', () => {
        expect(columnPlanProblem(drafts, [])).toBeNull();
        expect(columnPlanProblem([...drafts, { ...review, name: ' ' }], [])).toBe(
            'Every column needs a name.'
        );
        expect(columnPlanProblem([...drafts, { ...review, name: 'TODO' }], [])).toBe(
            'Two columns share a name.'
        );
        expect(columnPlanProblem(drafts.slice(1), [])).toBe(
            'A board keeps at least one Todo column.'
        );
        const removal = { id: 'col_old', name: 'Old', targetId: null, taskCount: 2 };
        expect(columnPlanProblem(drafts, [removal])).toBe('Choose where the Tasks in Old go.');
        expect(columnPlanProblem(drafts, [{ ...removal, targetId: 'col_todo' }])).toBeNull();
        expect(columnPlanProblem(drafts, [{ ...removal, taskCount: 0 }])).toBeNull();
    });

    test('the input keeps ids, creates drafts, and maps only removals holding Tasks', () => {
        const input = columnPlanInput(
            [...drafts, review],
            [
                { id: 'col_old', name: 'Old', targetId: 'col_todo', taskCount: 2 },
                { id: 'col_empty', name: 'Empty', targetId: null, taskCount: 0 },
            ]
        );
        expect(input.columns.at(-1)).toEqual({ category: 'active', name: 'Review' });
        expect(input.columns[0]).toEqual({ category: 'todo', id: 'col_todo', name: 'Todo' });
        expect(input.moveTasks).toEqual({ col_old: 'col_todo' });
    });

    test('a drag lands before or after its target', () => {
        const names = (list: readonly ColumnDraft[]) => list.map((draft) => draft.name);
        expect(names(reorderColumnDrafts(drafts, 'col_done', 'col_todo', 'before'))).toEqual([
            'Done',
            'Todo',
            'In progress',
        ]);
        expect(names(reorderColumnDrafts(drafts, 'col_todo', 'col_active', 'after'))).toEqual([
            'In progress',
            'Todo',
            'Done',
        ]);
    });

    test('a suggested key is initials or a head, and always a legal start', () => {
        expect(suggestBoardKey('Security')).toBe('SEC');
        expect(suggestBoardKey('Product Launch Plan')).toBe('PLP');
        expect(suggestBoardKey('')).toBe('');
        expect(suggestBoardKey('2026 Roadmap')).toBe('R');
    });
});
