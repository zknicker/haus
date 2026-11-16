import {
    type Board,
    type BoardColumn,
    isClosedColumnCategory,
    type Task,
    type TaskAssignee,
} from '@haus/api';
import { taskPriorityRank } from './task-presentation.ts';

export type BoardLayout = 'board' | 'list';

/** The Board is the resting lens; `list` is the deliberate choice, so it is what rides the URL. */
export function resolveBoardLayout(value: string | null): BoardLayout {
    return value === 'list' ? 'list' : 'board';
}

/** The one spelling of "nobody" a filter or picker uses. */
export const unassignedKey = 'none';

export function assigneeKey(assignee: TaskAssignee | null): string {
    if (!assignee) {
        return unassignedKey;
    }
    return assignee.kind === 'agent' ? `agent:${assignee.agentId}` : `user:${assignee.userId}`;
}

export function assigneeFromKey(key: string): TaskAssignee | null {
    const [kind, id] = key.split(':');
    if (kind === 'agent' && id) {
        return { agentId: id, kind };
    }
    return kind === 'user' && id ? { kind, userId: id } : null;
}

export interface BoardFilters {
    /** An `assigneeKey`, `none` included; null keeps everyone's. */
    assignee: null | string;
    labelId: null | string;
}

export function filterTasks(tasks: readonly Task[], filters: BoardFilters): Task[] {
    return tasks.filter(
        (task) =>
            (filters.assignee === null || assigneeKey(task.assignee) === filters.assignee) &&
            (filters.labelId === null || task.labelIds.includes(filters.labelId))
    );
}

export interface BoardColumnGroup {
    column: BoardColumn;
    tasks: Task[];
}

/** A board's columns in position order, each with its Tasks in reading order. */
export function groupTasksByColumn(board: Board, tasks: readonly Task[]): BoardColumnGroup[] {
    return [...board.columns]
        .sort((a, b) => a.position - b.position)
        .map((column) => ({
            column,
            tasks: tasks
                .filter((task) => task.columnId === column.id)
                .sort(isClosedColumnCategory(column.category) ? byNewestFinish : byPriorityThenAge),
        }));
}

/** Finished work is history: a done column shows this many until the reader asks for the rest. */
export const doneColumnCap = 10;

/** The Tasks a column shows, and how many its "Show N more" holds back. */
export function visibleColumnTasks(group: BoardColumnGroup, expanded: boolean) {
    if (expanded || group.column.category !== 'done') {
        return { hidden: 0, tasks: group.tasks };
    }
    return {
        hidden: Math.max(0, group.tasks.length - doneColumnCap),
        tasks: group.tasks.slice(0, doneColumnCap),
    };
}

export interface ActiveOverload {
    agentId: string;
    count: number;
}

/**
 * Agents holding more than one active Task, by the column the warning sits on:
 * the first active column holding one of theirs. An Agent works one Task at a
 * time, so the Server allows the second and the board says so (ADR 0051). It
 * reads the board's whole list, because a filter does not make the Agent less
 * busy.
 */
export function activeOverloadsByColumn(
    board: Board,
    tasks: readonly Task[]
): ReadonlyMap<string, ActiveOverload[]> {
    const counts = new Map<string, { columnId: string; count: number }>();
    for (const { column, tasks: columnTasks } of groupTasksByColumn(board, tasks)) {
        if (column.category !== 'active') {
            continue;
        }
        for (const { assignee } of columnTasks) {
            if (assignee?.kind === 'agent') {
                const current = counts.get(assignee.agentId);
                counts.set(assignee.agentId, {
                    columnId: current?.columnId ?? column.id,
                    count: (current?.count ?? 0) + 1,
                });
            }
        }
    }
    const byColumn = new Map<string, ActiveOverload[]>();
    for (const [agentId, { columnId, count }] of counts) {
        if (count > 1) {
            byColumn.set(columnId, [...(byColumn.get(columnId) ?? []), { agentId, count }]);
        }
    }
    return byColumn;
}

/** The board's one-line state: how much is open and how much is done. */
export function summarizeTasks(tasks: readonly Task[]) {
    return {
        canceled: tasks.filter((task) => task.category === 'canceled').length,
        done: tasks.filter((task) => task.category === 'done').length,
        open: tasks.filter((task) => !isClosedColumnCategory(task.category)).length,
    };
}

function byPriorityThenAge(a: Task, b: Task) {
    return (
        taskPriorityRank[a.priority] - taskPriorityRank[b.priority] ||
        a.createdAt.localeCompare(b.createdAt)
    );
}

function byNewestFinish(a: Task, b: Task) {
    return (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
}
