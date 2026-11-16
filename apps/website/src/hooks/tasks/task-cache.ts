import {
    type BoardColumn,
    type ColumnCategory,
    isClosedColumnCategory,
    type Task,
    type TaskDetail,
} from '@haus/api';
import type { Query, QueryClient, QueryKey } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * The cached Task reads a mutation writes through. `task.get` is addressed by
 * id or by key and an event names only the id, so a read is matched by the
 * record it holds, never by its input.
 */

/** Every cached `task.get` of the Server whose Task passes `matches`. */
export function taskDetailKeys(
    queryClient: QueryClient,
    serverId: string,
    matches: (detail: TaskDetail) => boolean
): QueryKey[] {
    return detailQueries(queryClient, serverId)
        .filter((query) => {
            const detail = query.state.data as TaskDetail | undefined;
            return detail !== undefined && matches(detail);
        })
        .map((query) => query.queryKey);
}

/** Every cached read holding this Task: its lists and its details. */
export function taskReads(queryClient: QueryClient, serverId: string, taskId: string) {
    return [
        ...listQueries(queryClient, serverId).filter((query) =>
            (query.state.data as Task[] | undefined)?.some((task) => task.id === taskId)
        ),
        ...detailQueries(queryClient, serverId).filter(
            (query) => (query.state.data as TaskDetail | undefined)?.id === taskId
        ),
    ];
}

/**
 * Moves one Task in every cached read and returns the undo. The move bumps the
 * version as the Server will, so a second drag before the ack sends the
 * version it will meet. A list filtered by category drops a Task leaving it;
 * one filtered to the destination learns the arrival from `task.onUpdated`.
 */
export function moveTaskInCache(
    queryClient: QueryClient,
    { column, serverId, taskId }: { column: BoardColumn; serverId: string; taskId: string },
    now = new Date().toISOString()
): () => void {
    const undos: (() => void)[] = [];
    for (const query of listQueries(queryClient, serverId)) {
        const list = query.state.data as Task[] | undefined;
        const index = list?.findIndex((task) => task.id === taskId) ?? -1;
        const previous = list?.[index];
        if (!(list && previous) || previous.columnId === column.id) {
            continue;
        }
        const moved = movedTask(previous, column, now);
        queryClient.setQueryData<Task[]>(
            query.queryKey,
            keepsCategory(query, column.category)
                ? list.map((task) => (task.id === taskId ? moved : task))
                : list.filter((task) => task.id !== taskId)
        );
        undos.push(() =>
            queryClient.setQueryData<Task[]>(query.queryKey, (current) =>
                current ? restoreInList(current, previous, index) : current
            )
        );
    }
    for (const query of detailQueries(queryClient, serverId)) {
        const previous = query.state.data as TaskDetail | undefined;
        if (previous?.id !== taskId || previous.columnId === column.id) {
            continue;
        }
        queryClient.setQueryData<TaskDetail>(query.queryKey, movedTask(previous, column, now));
        undos.push(() => queryClient.setQueryData<TaskDetail>(query.queryKey, previous));
    }
    return () => {
        for (const undo of undos) {
            undo();
        }
    };
}

/**
 * A mutation's ack: the authoritative Task replaces the cached one, unless a
 * newer read already landed. Without it the next edit would send a version
 * `task.onUpdated` has not refreshed yet. List membership stays with the event.
 */
export function writeTaskResult(queryClient: QueryClient, task: Task) {
    for (const query of listQueries(queryClient, task.serverId)) {
        const list = query.state.data as Task[] | undefined;
        if (list?.some((item) => item.id === task.id && item.version <= task.version)) {
            queryClient.setQueryData<Task[]>(
                query.queryKey,
                list.map((item) => (item.id === task.id ? task : item))
            );
        }
    }
    for (const query of detailQueries(queryClient, task.serverId)) {
        const detail = query.state.data as TaskDetail | undefined;
        if (detail?.id === task.id && detail.version <= task.version) {
            queryClient.setQueryData<TaskDetail>(query.queryKey, { ...detail, ...task });
        }
    }
}

function listQueries(queryClient: QueryClient, serverId: string) {
    return queryClient
        .getQueryCache()
        .findAll({ queryKey: getQueryKey(hausTrpc.task.list, { serverId }) });
}

function detailQueries(queryClient: QueryClient, serverId: string) {
    return queryClient
        .getQueryCache()
        .findAll({ queryKey: getQueryKey(hausTrpc.task.get, { serverId }) });
}

function movedTask<TTask extends Task>(task: TTask, column: BoardColumn, now: string): TTask {
    return {
        ...task,
        category: column.category,
        columnId: column.id,
        // `completedAt` is set exactly while the Task is closed; closed to closed keeps it.
        completedAt: isClosedColumnCategory(column.category) ? (task.completedAt ?? now) : null,
        version: task.version + 1,
    };
}

function keepsCategory(query: Pick<Query, 'queryKey'>, category: ColumnCategory) {
    const [, options] = query.queryKey as [
        unknown,
        { input?: { categories?: ColumnCategory[] } } | undefined,
    ];
    return options?.input?.categories?.includes(category) ?? true;
}

function restoreInList(list: Task[], previous: Task, index: number) {
    if (list.some((task) => task.id === previous.id)) {
        return list.map((task) => (task.id === previous.id ? previous : task));
    }
    return [...list.slice(0, index), previous, ...list.slice(index)];
}
