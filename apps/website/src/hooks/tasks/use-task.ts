import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** A Task by its key (`SEC-12`, what a route carries) or its id (what a reference carries). */
export type TaskAddress = { key: string } | { taskId: string };

/** One Task with its Mentioned in and Reminders. */
export function useTask(serverId: string | undefined, address: TaskAddress | undefined) {
    return hausTrpc.task.get.useQuery(
        { ...(address ?? { taskId: '' }), serverId: serverId ?? '' },
        {
            ...queryPolicy.syncedSnapshot,
            enabled: address !== undefined && serverId !== undefined,
        }
    );
}
