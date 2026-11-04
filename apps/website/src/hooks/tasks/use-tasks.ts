import type { TaskListInput } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export type TaskListFilters = Pick<TaskListInput, 'assignee' | 'categories'>;

/** One board's Tasks, oldest first: one read for the whole board. */
export function useTasks({
    boardId,
    filters,
    serverId,
}: {
    boardId: string | undefined;
    filters?: TaskListFilters;
    serverId: string | undefined;
}) {
    return hausTrpc.task.list.useQuery(
        { ...filters, boardId: boardId ?? '', serverId: serverId ?? '' },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: boardId !== undefined && serverId !== undefined,
        }
    );
}
