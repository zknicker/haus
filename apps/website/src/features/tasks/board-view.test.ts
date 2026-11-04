import { describe, expect, test } from 'bun:test';
import type { Board, BoardColumn, ColumnCategory, Task } from '@haus/api';
import {
    activeOverloadsByColumn,
    assigneeFromKey,
    assigneeKey,
    doneColumnCap,
    filterTasks,
    groupTasksByColumn,
    resolveBoardLayout,
    summarizeTasks,
    visibleColumnTasks,
} from './board-view.ts';

const columns: BoardColumn[] = [
    column('col_done', 'done', 3),
    column('col_todo', 'todo', 0),
    column('col_active', 'active', 1),
    column('col_review', 'active', 2),
];
const board: Board = {
    archivedAt: null,
    columns,
    createdAt: '2026-11-01T00:00:00.000Z',
    id: 'brd_one',
    key: 'SEC',
    name: 'Security',
    openTaskCount: 0,
    serverId: 'srv_one',
    updatedAt: '2026-11-01T00:00:00.000Z',
    version: 1,
};

describe('board view', () => {
    test('the Board is the default lens', () => {
        expect(resolveBoardLayout(null)).toBe('board');
        expect(resolveBoardLayout('kanban')).toBe('board');
        expect(resolveBoardLayout('list')).toBe('list');
    });

    test('assignee keys round-trip a person, an Agent, and nobody', () => {
        const agent = { agentId: 'agt_forge', kind: 'agent' } as const;
        const person = { kind: 'user', userId: 'usr_zach' } as const;
        expect(assigneeFromKey(assigneeKey(agent))).toEqual(agent);
        expect(assigneeFromKey(assigneeKey(person))).toEqual(person);
        expect(assigneeFromKey(assigneeKey(null))).toBeNull();
    });

    test('filters narrow by assignee, unassigned included, and by label', () => {
        const tasks = [
            task({ assignee: { agentId: 'agt_forge', kind: 'agent' }, id: 'a', labelIds: ['l1'] }),
            task({ id: 'b', labelIds: ['l2'] }),
        ];
        expect(
            filterTasks(tasks, { assignee: 'agent:agt_forge', labelId: null }).map(({ id }) => id)
        ).toEqual(['a']);
        expect(filterTasks(tasks, { assignee: 'none', labelId: null }).map(({ id }) => id)).toEqual(
            ['b']
        );
        expect(filterTasks(tasks, { assignee: null, labelId: 'l2' }).map(({ id }) => id)).toEqual([
            'b',
        ]);
    });

    test('columns follow position; open Tasks read by priority then age, done newest first', () => {
        const groups = groupTasksByColumn(board, [
            task({ createdAt: '2026-11-02T00:00:00.000Z', id: 'newer', priority: 'high' }),
            task({ createdAt: '2026-11-01T00:00:00.000Z', id: 'older', priority: 'high' }),
            task({ createdAt: '2026-11-03T00:00:00.000Z', id: 'urgent', priority: 'urgent' }),
            task({
                category: 'done',
                columnId: 'col_done',
                completedAt: '2026-11-01T00:00:00.000Z',
                id: 'first',
            }),
            task({
                category: 'done',
                columnId: 'col_done',
                completedAt: '2026-11-03T00:00:00.000Z',
                id: 'latest',
            }),
        ]);
        expect(groups.map((group) => group.column.id)).toEqual([
            'col_todo',
            'col_active',
            'col_review',
            'col_done',
        ]);
        expect(groups[0]?.tasks.map(({ id }) => id)).toEqual(['urgent', 'older', 'newer']);
        expect(groups[3]?.tasks.map(({ id }) => id)).toEqual(['latest', 'first']);
    });

    test('only a done column caps, and the cap reports what it holds back', () => {
        const tasks = Array.from({ length: doneColumnCap + 3 }, (_, index) =>
            task({ id: `t${index}` })
        );
        const done = { column: column('d', 'done', 0), tasks };
        const todo = { column: column('t', 'todo', 0), tasks };
        expect(visibleColumnTasks(done, false).hidden).toBe(3);
        expect(visibleColumnTasks(done, false).tasks).toHaveLength(doneColumnCap);
        expect(visibleColumnTasks(done, true).hidden).toBe(0);
        expect(visibleColumnTasks(todo, false).hidden).toBe(0);
    });

    test('an Agent over one active Task warns once, on its first active column', () => {
        const forge = { agentId: 'agt_forge', kind: 'agent' } as const;
        const overloads = activeOverloadsByColumn(board, [
            task({ assignee: forge, category: 'active', columnId: 'col_review', id: 'a' }),
            task({ assignee: forge, category: 'active', columnId: 'col_active', id: 'b' }),
            task({
                assignee: { agentId: 'agt_tiny', kind: 'agent' },
                category: 'active',
                columnId: 'col_active',
                id: 'c',
            }),
            task({
                assignee: { kind: 'user', userId: 'usr_zach' },
                category: 'active',
                columnId: 'col_active',
                id: 'd',
            }),
            task({
                assignee: { kind: 'user', userId: 'usr_zach' },
                category: 'active',
                columnId: 'col_review',
                id: 'e',
            }),
        ]);
        expect([...overloads.entries()]).toEqual([
            ['col_active', [{ agentId: 'agt_forge', count: 2 }]],
        ]);
    });

    test('the summary splits open from done and canceled', () => {
        expect(
            summarizeTasks([
                task({ id: 'a' }),
                task({ category: 'active', id: 'b' }),
                task({ category: 'done', completedAt: '2026-11-01T00:00:00.000Z', id: 'c' }),
                task({ category: 'canceled', completedAt: '2026-11-01T00:00:00.000Z', id: 'd' }),
            ])
        ).toEqual({ canceled: 1, done: 1, open: 2 });
    });
});

function column(id: string, category: ColumnCategory, position: number): BoardColumn {
    return { category, id, name: id, position };
}

function task(overrides: Partial<Task> & { id: string }): Task {
    return {
        assignee: null,
        boardId: 'brd_one',
        category: 'todo',
        columnId: 'col_todo',
        completedAt: null,
        createdAt: '2026-11-01T00:00:00.000Z',
        createdBy: { kind: 'user', userId: 'usr_zach' },
        description: '',
        dueOn: null,
        key: 'SEC-1',
        labelIds: [],
        number: 1,
        priority: 'none',
        serverId: 'srv_one',
        title: overrides.id,
        updatedAt: '2026-11-01T00:00:00.000Z',
        version: 1,
        ...overrides,
    };
}
