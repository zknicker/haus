import { hausTrpc } from '../../lib/haus-server.tsx';
import { queryPolicy } from '../../lib/query-policy.ts';

/** The Server's Task key ledger (`taskKey.list`, ADR 0053 decision 11), by key. */
export function useTaskKeys(serverId: string) {
    const { data, error, isPending } = hausTrpc.taskKey.list.useQuery(
        { serverId },
        queryPolicy.syncedSnapshot
    );
    return { data, error, isPending };
}

/**
 * Adds a key to the ledger. No event announces a new key, so the receipt is
 * the ledger read's only refresh: it appends the entry the Server returned.
 */
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
