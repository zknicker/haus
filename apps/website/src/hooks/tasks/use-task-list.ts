import type { TaskListInput } from '@haus/api';
import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export type TaskListFilters = Pick<TaskListInput, 'archived' | 'projectId'>;

export function useTaskList(
    serverId: string,
    filters: TaskListFilters,
    { enabled = true }: { enabled?: boolean } = {}
) {
    const { data, error, isPending } = hausTrpc.task.list.useQuery(
        { ...filters, serverId },
        { ...queryPolicy.syncedSnapshot, enabled }
    );
    return { data, error, isPending };
}
