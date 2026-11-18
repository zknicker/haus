import type { TaskListInput } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export type TaskListFilters = Pick<TaskListInput, 'assignee' | 'keyId' | 'states'>;

export function useTaskList(serverId: string, filters: TaskListFilters) {
    const { data, error, isPending } = hausTrpc.task.list.useQuery(
        { ...filters, serverId },
        queryPolicy.syncedSnapshot
    );
    return { data, error, isPending };
}
