import type { TaskListInput } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export type TaskListFilters = Pick<TaskListInput, 'assignee' | 'keyId' | 'states'>;

/** The Server's Tasks for the flat Tasks page (ADR 0053 decision 10), narrowed by its filters. */
export function useTaskList(serverId: string, filters: TaskListFilters) {
    const { data, error, isPending } = hausTrpc.task.list.useQuery(
        { ...filters, serverId },
        queryPolicy.syncedSnapshot
    );
    return { data, error, isPending };
}
