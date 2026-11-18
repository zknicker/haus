import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

export function useTaskKeys(serverId: string) {
    const { data, error, isPending } = hausTrpc.taskKey.list.useQuery(
        { serverId },
        queryPolicy.syncedSnapshot
    );
    return { data, error, isPending };
}

export function useCreateTaskKey() {
    const utils = hausTrpc.useUtils();
    return hausTrpc.taskKey.create.useMutation({
        onSuccess: ({ taskKey }) => {
            utils.taskKey.list.setData({ serverId: taskKey.serverId }, (ledger) =>
                ledger && !ledger.some((entry) => entry.id === taskKey.id)
                    ? [...ledger, taskKey].sort((a, b) => a.key.localeCompare(b.key))
                    : ledger
            );
        },
    });
}
