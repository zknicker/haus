import type { Task, TaskDetail } from '@haus/api';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { getQueryKey } from '@trpc/react-query';
import { hausTrpc } from '../../lib/haus-server.tsx';

/**
 * The cached Task reads a mutation writes through. `task.get` is addressed by
 * id or by short id and an event names only the id, so a read is matched by the
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
            queryClient.setQueryData<TaskDetail>(query.queryKey, withTask(detail, task));
        }
    }
}

/**
 * A detail with the acked Task's fields. Its resolved description was read for
 * the old text, so an edited one renders its own source until `task.onUpdated`
 * refetches; the Task links stay, since they match by text.
 */
function withTask(detail: TaskDetail, task: Task): TaskDetail {
    return task.description === detail.description
        ? { ...detail, ...task }
        : { ...detail, ...task, descriptionContent: task.description };
}

function listQueries(queryClient: QueryClient, serverId: string) {
    const cache = queryClient.getQueryCache();
    return [
        ...cache.findAll({ queryKey: getQueryKey(hausTrpc.task.list, { serverId }) }),
        ...cache.findAll({ queryKey: getQueryKey(hausTrpc.task.listActive, { serverId }) }),
    ];
}

function detailQueries(queryClient: QueryClient, serverId: string) {
    return queryClient
        .getQueryCache()
        .findAll({ queryKey: getQueryKey(hausTrpc.task.get, { serverId }) });
}
